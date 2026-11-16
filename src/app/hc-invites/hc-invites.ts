import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { HC_EVENT, buildInvitationJpeg, formatInviteeName, loadCardFonts, renderCard, renderClusterImage } from './hc-card';

/** One entry in public/hc-invitees.json (same shape as public/invitees.json). */
export interface HcInvitee {
  id: string;
  title: string;
  name: string;
  inviteeType: 'single' | 'couple' | 'family';
  invitedCount?: number;
}

interface Row {
  id: string;
  displayName: string;
}

type RowState = 'idle' | 'preparing' | 'ready' | 'sent';

const SENT_KEY = 'hcInvitesSent';

/**
 * /hcinvites: the Home Coming & Housewarming guest list. Each guest gets a
 * personalised JPG card that is handed to the device share sheet (WhatsApp).
 */
@Component({
  selector: 'app-root',
  templateUrl: './hc-invites.html',
  styleUrl: './hc-invites.css'
})
export class HcInvites implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly titleService = inject(Title);

  protected readonly event = HC_EVENT;
  protected readonly rows = signal<Row[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly query = signal('');
  protected readonly states = signal<Record<string, RowState>>({});
  protected readonly toast = signal('');
  protected readonly preview = signal<{ row: Row; src: string } | null>(null);
  protected readonly cornerImage = signal('');

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.rows().filter((r) => r.displayName.toLowerCase().includes(q)) : this.rows();
  });

  private readonly imageCache = new Map<string, File>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    this.titleService.setTitle('Home Coming & Housewarming · Invitations');
    this.cornerImage.set(renderClusterImage());
    void loadCardFonts();

    const sent = this.readSent();
    try {
      const list = await firstValueFrom(this.http.get<HcInvitee[]>('/hc-invitees.json'));
      const rows = (list ?? [])
        .filter((i) => String(i?.id ?? '').trim() && String(i?.name ?? '').trim())
        // The row key combines id and name (plus a counter for exact repeats):
        // the list may reuse an id, and each guest must still get their own card.
        .map((i, index, all) => {
          const base = `${String(i.id).trim()}|${String(i.name).trim()}`;
          const repeat = all.slice(0, index).filter((p) => `${String(p.id).trim()}|${String(p.name).trim()}` === base).length;
          return { id: repeat ? `${base}|${repeat}` : base, displayName: formatInviteeName(i) };
        });
      this.rows.set(rows);
      this.states.set(Object.fromEntries(rows.filter((r) => sent.includes(r.id)).map((r) => [r.id, 'sent' as RowState])));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  protected stateOf(id: string): RowState {
    return this.states()[id] ?? 'idle';
  }

  protected buttonLabel(id: string): string {
    switch (this.stateOf(id)) {
      case 'preparing':
        return 'Preparing…';
      case 'ready':
        return 'Tap to Send';
      case 'sent':
        return 'Send Again';
      default:
        return 'Send Invitation';
    }
  }

  protected async openPreview(row: Row): Promise<void> {
    await loadCardFonts();
    this.preview.set({ row, src: renderCard(row.displayName).toDataURL('image/jpeg', 0.85) });
  }

  protected closePreview(): void {
    this.preview.set(null);
  }

  protected async download(row: Row): Promise<void> {
    const file = await this.getImage(row);
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /**
   * Hand the JPG to the share sheet so it can be sent on WhatsApp. Browsers only
   * allow sharing straight after a tap, so if building the image took too long the
   * button turns into "Tap to Send" and the next tap shares the ready file.
   */
  protected async send(row: Row): Promise<void> {
    if (this.stateOf(row.id) === 'preparing') return;
    const cached = this.imageCache.has(row.id);
    if (!cached) this.setState(row.id, 'preparing');

    let file: File;
    try {
      file = await this.getImage(row);
    } catch {
      this.setState(row.id, 'idle');
      this.showToast('Could not create the invitation. Please try again.');
      return;
    }

    const shareData: ShareData = { files: [file] };
    if (!navigator.canShare?.(shareData)) {
      await this.download(row);
      this.setState(row.id, 'idle');
      this.showToast('This browser cannot share files. The image was downloaded — attach it in WhatsApp.');
      return;
    }

    try {
      await navigator.share(shareData);
      this.markSent(row.id);
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError') {
        this.setState(row.id, 'ready');
        this.showToast('Invitation ready — tap “Tap to Send” to open WhatsApp.');
      } else {
        // AbortError: the share sheet was closed without sending.
        this.setState(row.id, this.readSent().includes(row.id) ? 'sent' : 'idle');
      }
    }
  }

  private async getImage(row: Row): Promise<File> {
    const hit = this.imageCache.get(row.id);
    if (hit) return hit;
    const blob = await buildInvitationJpeg(row.displayName);
    const safe = row.displayName.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
    const file = new File([blob], `Home Coming Invitation - ${safe}.jpg`, { type: 'image/jpeg' });
    this.imageCache.set(row.id, file);
    return file;
  }

  private setState(id: string, state: RowState): void {
    this.states.update((s) => ({ ...s, [id]: state }));
  }

  private markSent(id: string): void {
    this.setState(id, 'sent');
    const sent = this.readSent();
    if (!sent.includes(id)) {
      try {
        localStorage.setItem(SENT_KEY, JSON.stringify([...sent, id]));
      } catch {
        // Storage unavailable (private mode): the tick just won't persist.
      }
    }
  }

  private readSent(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]');
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }

  private showToast(message: string): void {
    this.toast.set(message);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 5000);
  }
}
