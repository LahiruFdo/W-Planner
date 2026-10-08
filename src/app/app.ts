import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, HostBinding, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export interface StorySlide {
  imageUrl: string;
  title: string;
  caption: string;
}

export type InvitationType = 'single' | 'couple' | 'family';
export type GuestTitle = '' | 'Mr.' | 'Mrs.' | 'Ms.' | 'Rev. Fr.' | 'Rev. Sr.';

export interface GuestSearchResult {
  id: string;
  title: string;
  invitationType: string;
  guestType: string; // backward compat alias for invitationType
  name: string;
  searchKeywords: string;
  invitedCount: number;
}

export interface AdminGuest extends GuestSearchResult {
  confirmed?: string;
  isComing?: string;
  finalCount?: string;
}

export const GUEST_TITLE_OPTIONS: GuestTitle[] = ['Mr.', 'Mrs.', 'Ms.', 'Rev. Fr.', 'Rev. Sr.'];
export const INVITATION_TYPE_OPTIONS: { value: InvitationType; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'couple', label: 'Couple' },
  { value: 'family', label: 'Family' }
];

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  protected readonly config = environment;
  protected readonly brideName = this.config.brideName;
  protected readonly groomName = this.config.groomName;
  protected readonly date = new Date(this.config.weddingDateIso);
  protected readonly churchName = this.config.churchName;
  protected readonly churchMassTime = this.config.churchMassTime;
  protected readonly churchAddress = this.config.churchAddress;
  protected readonly churchMapUrl = this.config.churchMapUrl;
  protected readonly receptionVenueName = this.config.receptionVenueName;
  protected readonly receptionTime = this.config.receptionTime;
  protected readonly receptionAddress = this.config.receptionAddress;
  protected readonly receptionMapUrl = this.config.receptionMapUrl;

  protected readonly monthName = this.date.toLocaleString('en-US', { month: 'long' });
  protected readonly year = this.date.getFullYear();
  protected readonly calendarDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly dayCells = this.buildCalendarCells(this.date);

  // Guests move through the invitation one section at a time (no page scroll),
  // using the Back / Next buttons under each section.
  protected readonly sections = [
    { id: 'home', label: 'Home' },
    { id: 'details', label: 'Wedding Details' },
    { id: 'calendar', label: 'Save the Date' },
    { id: 'location', label: 'The Venues' },
    { id: 'rsvp', label: 'RSVP' }
  ];
  protected activeSectionIndex = 0;

  // Admin dashboard (served under `/admin` on the same SPA)
  protected adminKeyInput = '';
  protected adminAuthed = false;
  protected adminLoading = false;
  protected adminError = '';
  protected adminGuestsLoading = false;
  protected adminAddingGuest = false;
  protected adminSavingGuestId: string | null = null;
  protected adminDeletingGuestId: string | null = null;
  protected adminSuccessMessage = '';
  protected adminGuests: AdminGuest[] = [];
  protected readonly titleOptions = GUEST_TITLE_OPTIONS;
  protected readonly invitationTypeOptions = INVITATION_TYPE_OPTIONS;

  protected adminNewGuest: {
    title: string;
    invitationType: string;
    name: string;
    searchKeywords: string;
    invitedCount: number;
    id?: string;
  } = {
    title: '',
    invitationType: 'single',
    name: '',
    searchKeywords: '',
    invitedCount: 1
  };
  protected adminStorySlides: StorySlide[] = [];
  protected adminStoryLoading = false;
  protected adminStorySaving = false;
  protected adminStoryUploading = false;

  protected guestSearchQuery = '';
  protected guestSearchResults: GuestSearchResult[] = [];
  protected guestSearchLoading = false;
  protected selectedGuest: GuestSearchResult | null = null;
  protected attendingCount = 1;
  protected attendance = '';
  protected attendingCountError = '';
  protected submitting = false;
  protected statusMessage = '';
  private guestSearchTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Build the formatted invitation display string from the stored fields.
   * - single:  "{title} {name}"
   * - couple:  "Mr. & Mrs. {name}"
   * - family:  "{title} {name} & Family"
   */
  protected formatGuestDisplay(
    g: { title?: string; invitationType?: string; guestType?: string; name?: string } | null | undefined
  ): string {
    if (!g) return '';
    const title = (g.title ?? '').trim();
    const type = ((g.invitationType ?? g.guestType ?? '').trim() || 'single').toLowerCase();
    const name = (g.name ?? '').trim();

    if (type === 'couple') {
      return `Mr. & Mrs. ${name}`.trim();
    }
    if (type === 'family') {
      return [title || 'Mr.', name, '& Family'].filter(Boolean).join(' ').trim();
    }
    return [title, name].filter(Boolean).join(' ').trim();
  }

  protected get brideLetters(): string[] {
    return Array.from(this.brideName ?? '');
  }

  protected get groomLetters(): string[] {
    return Array.from(this.groomName ?? '');
  }

  // Invitation cover: the shared link lands on a cover showing only the S|L
  // monogram and a "View Invitation" button. The page content is only rendered
  // once the guest taps the button, so every entrance animation starts from
  // that moment while the cover fades away.
  protected isCoverReady = false;
  protected isInvitationOpen = false;
  protected isCoverDismissed = false;
  private readonly coverFadeMs = 900;
  private coverTimer: ReturnType<typeof setTimeout> | null = null;

  // Pause after opening (while the cover fades) before the names float in.
  private readonly badgeEntranceDurationMs = 500;

  private get badgeEntranceStartMs(): number {
    return 0;
  }

  private get badgeEntranceCompleteMs(): number {
    return this.badgeEntranceStartMs + this.badgeEntranceDurationMs;
  }

  protected nameLetterDelay(index: number, offset = 0): string {
    return `${this.badgeEntranceCompleteMs + (offset + index) * 90}ms`;
  }

  private get lastLetterStartMs(): number {
    const totalLetters = this.brideLetters.length + this.groomLetters.length + 1;
    return this.badgeEntranceCompleteMs + (totalLetters - 1) * 90;
  }

  // Letters finish floating, then a glow-in animation plays before anything else loads.
  private readonly nameGlowInDurationMs = 1500;

  private get nameGlowInStartMs(): number {
    // Begin glow as the last letter is settling so the two motions blend.
    return this.lastLetterStartMs;
  }

  private get nameGlowInCompleteMs(): number {
    return this.nameGlowInStartMs + this.nameGlowInDurationMs;
  }

  private get subtitleStartMs(): number {
    return this.nameGlowInCompleteMs + 600;
  }

  protected get subtitleRevealDelay(): string {
    return `${this.subtitleStartMs}ms`;
  }

  @HostBinding('style.--badge-entrance-delay')
  protected get badgeEntranceDelay(): string {
    return `${this.badgeEntranceStartMs}ms`;
  }

  @HostBinding('style.--badge-entrance-duration')
  protected get badgeEntranceDuration(): string {
    return `${this.badgeEntranceDurationMs}ms`;
  }

  @HostBinding('style.--badge-breathe-delay')
  protected get badgeBreatheDelay(): string {
    return `${this.badgeEntranceCompleteMs}ms`;
  }

  @HostBinding('style.--name-glow-in-delay')
  protected get nameGlowInDelay(): string {
    return `${this.nameGlowInStartMs}ms`;
  }

  @HostBinding('style.--name-glow-loop-delay')
  protected get nameGlowLoopDelay(): string {
    return `${this.nameGlowInCompleteMs}ms`;
  }

  @HostBinding('style.--post-subtitle-delay')
  protected get postSubtitleDelay(): string {
    const subtitleDuration = 1200;
    return `${this.subtitleStartMs + subtitleDuration - 200}ms`;
  }

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
    private readonly titleService: Title
  ) {}

  /**
   * Set the browser tab title (e.g. "Sapuni & Lahiru · Wedding Invitation").
   * The tab icon is the monogram PNG linked from index.html.
   */
  private applyBrowserBranding(): void {
    if (this.brideName?.trim() && this.groomName?.trim()) {
      this.titleService.setTitle(`${this.brideName} & ${this.groomName} · Wedding Invitation`);
    } else {
      this.titleService.setTitle('Wedding Invitation');
    }
  }

  protected get isAdminRoute(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.location.pathname.toLowerCase().startsWith('/admin');
  }

  async ngOnInit(): Promise<void> {
    this.applyBrowserBranding();
    this.prepareCover();
    if (this.isAdminRoute) {
      const saved = window.sessionStorage.getItem('adminKey') ?? '';
      if (saved.trim()) {
        this.adminKeyInput = saved.trim();
        void this.adminTryAutoLogin();
      }
    }
  }

  private prepareCover(): void {
    if (typeof window === 'undefined' || this.isAdminRoute) {
      this.isCoverReady = true;
      return;
    }

    // Reveal the cover's contents once the card fonts have loaded, so the
    // monogram and script names never flash in a fallback font. The fonts are
    // requested explicitly (`fonts.ready` alone resolves before the cover has
    // even rendered). Cap the wait so a slow font CDN can't keep the guest
    // staring at a blank card.
    const fonts = (document as any).fonts;
    const fontReady: Promise<unknown> =
      fonts && typeof fonts.load === 'function'
        ? Promise.all(
            ['1em "Great Vibes"', '600 1em "Cinzel"', '1em "Playfair Display"', '1em "Cormorant Garamond"'].map(
              (f) => fonts.load(f).catch(() => undefined)
            )
          )
        : Promise.resolve();
    const maxWait = new Promise<void>((resolve) => setTimeout(resolve, 2500));

    void Promise.race([fontReady, maxWait]).then(() => {
      this.isCoverReady = true;
      this.cdr.markForCheck();
    });
  }

  protected openInvitation(): void {
    if (this.isInvitationOpen) {
      return;
    }
    this.isInvitationOpen = true;
    window.scrollTo(0, 0);
    this.coverTimer = setTimeout(() => {
      this.coverTimer = null;
      this.isCoverDismissed = true;
      this.cdr.markForCheck();
    }, this.coverFadeMs);
  }

  ngOnDestroy(): void {
    if (this.guestSearchTimer) {
      clearTimeout(this.guestSearchTimer);
      this.guestSearchTimer = null;
    }
    if (this.coverTimer) {
      clearTimeout(this.coverTimer);
      this.coverTimer = null;
    }
  }

  // Left / right arrow keys move between sections (but not while typing).
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (this.isAdminRoute || !this.isInvitationOpen) {
      return;
    }
    if ((event.target as HTMLElement | null)?.closest('input, select, textarea')) {
      return;
    }
    if (event.key === 'ArrowRight') {
      this.goToSection(this.activeSectionIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      this.goToSection(this.activeSectionIndex - 1);
    }
  }

  protected get hasApi(): boolean {
    return Boolean(this.config.apiBaseUrl?.trim());
  }

  private adminHeaders(): HttpHeaders {
    return new HttpHeaders({ 'x-admin-key': this.adminKeyInput });
  }

  /**
   * Translate an HTTP error from one of the admin endpoints into a human
   * message. Falls back to a sensible default if the server didn't return
   * a structured `{ error: '...' }` body.
   */
  private describeAdminError(e: unknown, fallback: string): string {
    const status = (e as { status?: number })?.status;
    const apiError = (e as { error?: { error?: string } })?.error?.error?.trim();
    if (status === 0) {
      return 'Could not reach the API. Make sure the backend (Functions) is running.';
    }
    if (status === 401) {
      return 'Admin key was rejected. Please log in again.';
    }
    if (status === 503) {
      return apiError || 'Backend storage is not configured.';
    }
    if (apiError) {
      return apiError;
    }
    if (status) {
      return `${fallback} (HTTP ${status})`;
    }
    return fallback;
  }

  private async loadAdminGuestsAndStory(): Promise<void> {
    await this.adminRefreshGuests();
    await this.loadAdminStorySlides();
  }

  private async adminTryAutoLogin(): Promise<void> {
    if (!this.adminKeyInput.trim()) {
      return;
    }
    await this.adminLogin();
  }

  private async loadAdminStorySlides(): Promise<void> {
    if (!this.hasApi) {
      this.adminStorySlides = [];
      return;
    }
    this.adminStoryLoading = true;
    this.adminError = '';
    try {
      const res = await firstValueFrom(
        this.http.get<{ slides?: StorySlide[] }>(this.apiUrl('story'), {
          headers: this.adminHeaders()
        })
      );
      // `/api/story` is anonymous in the backend right now, but we keep admin headers for consistency.
      const slides = res.slides ?? [];
      this.adminStorySlides = slides.map((s) => ({
        imageUrl: String(s.imageUrl ?? '').trim(),
        title: String(s.title ?? '').trim(),
        caption: String(s.caption ?? '').trim()
      }));
    } catch {
      this.adminStorySlides = [];
    } finally {
      this.adminStoryLoading = false;
      this.cdr.markForCheck();
    }
  }

  protected async adminLogin(): Promise<void> {
    if (!this.adminKeyInput.trim()) {
      this.adminError = 'Please enter an admin key.';
      return;
    }

    if (!this.hasApi) {
      this.adminError = 'API is not configured (apiBaseUrl missing).';
      return;
    }

    this.adminLoading = true;
    this.adminError = '';
    try {
      const res = await firstValueFrom(
        this.http.get<{ guests?: AdminGuest[] }>(this.apiUrl('manage/guests'), {
          headers: this.adminHeaders()
        })
      );

      this.adminAuthed = true;
      window.sessionStorage.setItem('adminKey', this.adminKeyInput.trim());
      this.adminGuests = res.guests ?? [];
      this.adminGuestsLoading = false;
      await this.loadAdminStorySlides();
    } catch (e: any) {
      this.adminAuthed = false;
      this.adminGuests = [];
      this.adminStorySlides = [];
      const status = e?.status;
      if (status === 404) {
        this.adminError =
          'API not found (404). Ensure the /api folder is deployed and Azure Functions are running.';
      } else if (status === 503) {
        this.adminError = e?.error?.error ?? 'API is not configured on the server.';
      } else {
        this.adminError = e?.error?.error ?? 'Admin authentication failed.';
      }
    } finally {
      this.adminLoading = false;
      this.cdr.markForCheck();
    }
  }

  protected adminLogout(): void {
    this.adminAuthed = false;
    this.adminGuests = [];
    this.adminStorySlides = [];
    this.adminError = '';
    this.adminSuccessMessage = '';
    window.sessionStorage.removeItem('adminKey');
  }

  protected async adminRefreshGuests(): Promise<void> {
    if (!this.adminAuthed) {
      return;
    }
    this.adminGuestsLoading = true;
    this.adminError = '';
    try {
      const res = await firstValueFrom(
        this.http.get<{ guests?: AdminGuest[] }>(this.apiUrl('manage/guests'), {
          headers: this.adminHeaders()
        })
      );
      this.adminGuests = res.guests ?? [];
    } catch {
      this.adminGuests = [];
      this.adminError = 'Could not load guests.';
    } finally {
      this.adminGuestsLoading = false;
      this.cdr.markForCheck();
    }
  }

  protected async adminUpsertGuest(g: AdminGuest): Promise<void> {
    if (!this.adminAuthed) {
      return;
    }

    const invitedCount = Number(g.invitedCount);
    if (!Number.isFinite(invitedCount) || invitedCount < 1) {
      this.adminError = 'Invited count must be >= 1.';
      return;
    }

    const payload = {
      id: (g.id ?? '').trim() || undefined,
      title: g.title ?? '',
      invitationType: (g.invitationType ?? g.guestType ?? 'single').trim() || 'single',
      name: g.name ?? '',
      searchKeywords: g.searchKeywords ?? '',
      invitedCount
    };

    this.adminSavingGuestId = g.id;
    this.adminError = '';
    this.adminSuccessMessage = '';
    try {
      await firstValueFrom(
        this.http.put(this.apiUrl('manage/guests'), payload, {
          headers: this.adminHeaders()
        })
      );
      this.adminSuccessMessage = 'Guest saved.';
      await this.adminRefreshGuests();
    } catch (e: unknown) {
      this.adminError = this.describeAdminError(e, 'Could not save guest.');
      console.error('Save guest failed:', e);
    } finally {
      this.adminSavingGuestId = null;
      this.cdr.markForCheck();
    }
  }

  protected async adminAddNewGuest(): Promise<void> {
    if (!this.adminAuthed) {
      return;
    }
    this.adminError = '';

    const payload = {
      title: this.adminNewGuest.title ?? '',
      invitationType: (this.adminNewGuest.invitationType ?? 'single').trim() || 'single',
      name: this.adminNewGuest.name ?? '',
      searchKeywords: this.adminNewGuest.searchKeywords ?? '',
      invitedCount: Number(this.adminNewGuest.invitedCount)
    };

    if (!payload.name.trim()) {
      this.adminError = 'Guest name is required.';
      return;
    }
    if (!Number.isFinite(payload.invitedCount) || payload.invitedCount < 1) {
      this.adminError = 'Invited count must be >= 1.';
      return;
    }

    this.adminAddingGuest = true;
    this.adminError = '';
    this.adminSuccessMessage = '';
    try {
      await firstValueFrom(
        this.http.put(this.apiUrl('manage/guests'), payload, {
          headers: this.adminHeaders()
        })
      );
      this.adminNewGuest = {
        title: '',
        invitationType: 'single',
        name: '',
        searchKeywords: '',
        invitedCount: 1
      };
      this.adminSuccessMessage = 'Guest added.';
      await this.adminRefreshGuests();
    } catch (e: unknown) {
      this.adminError = this.describeAdminError(e, 'Could not add guest.');
      console.error('Add guest failed:', e);
    } finally {
      this.adminAddingGuest = false;
      this.cdr.markForCheck();
    }
  }

  protected async adminDeleteGuest(g: AdminGuest): Promise<void> {
    if (!this.adminAuthed) {
      return;
    }
    const id = (g.id ?? '').trim();
    if (!id) {
      this.adminError = 'Cannot delete an unsaved guest.';
      return;
    }

    const label = this.formatGuestDisplay(g) || g.name || 'this guest';
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(`Delete ${label}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    this.adminDeletingGuestId = id;
    this.adminError = '';
    this.adminSuccessMessage = '';
    try {
      await firstValueFrom(
        this.http.delete(this.apiUrl(`manage/guests/${encodeURIComponent(id)}`), {
          headers: this.adminHeaders()
        })
      );
      // Optimistic local removal so the UI feels instant even before refresh resolves.
      this.adminGuests = this.adminGuests.filter((x) => x.id !== id);
      this.adminSuccessMessage = 'Guest deleted.';
      await this.adminRefreshGuests();
    } catch (e: unknown) {
      this.adminError = this.describeAdminError(e, 'Could not delete guest.');
      console.error('Delete guest failed:', e);
    } finally {
      this.adminDeletingGuestId = null;
      this.cdr.markForCheck();
    }
  }

  protected async adminSaveStory(): Promise<void> {
    if (!this.adminAuthed) {
      return;
    }
    if (!this.hasApi) {
      return;
    }
    this.adminStorySaving = true;
    this.adminError = '';
    try {
      await firstValueFrom(
        this.http.put(this.apiUrl('manage/story'), { slides: this.adminStorySlides }, { headers: this.adminHeaders() })
      );
    } catch {
      this.adminError = 'Could not save story.';
    } finally {
      this.adminStorySaving = false;
      this.cdr.markForCheck();
    }
  }

  protected moveAdminStorySlide(index: number, direction: -1 | 1): void {
    const next = index + direction;
    if (next < 0 || next >= this.adminStorySlides.length) {
      return;
    }
    const tmp = this.adminStorySlides[index];
    this.adminStorySlides[index] = this.adminStorySlides[next];
    this.adminStorySlides[next] = tmp;
  }

  protected async adminOnStoryImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.adminError = 'Please select an image file.';
      return;
    }
    if (!this.adminAuthed) {
      this.adminError = 'Please login as admin first.';
      return;
    }
    if (!this.hasApi) {
      this.adminError = 'API is not configured.';
      return;
    }

    this.adminStoryUploading = true;
    this.adminError = '';
    try {
      let sasRes: { uploadUrl?: string; publicUrl?: string };
      try {
        sasRes = await firstValueFrom(
          this.http.post<{ uploadUrl?: string; publicUrl?: string }>(
            this.apiUrl('manage/images/sas'),
            { fileName: file.name, contentType: file.type || 'application/octet-stream' },
            { headers: this.adminHeaders() }
          )
        );
      } catch (e: unknown) {
        const status = (e as { status?: number })?.status;
        const apiError =
          (e as { error?: { error?: string } })?.error?.error ?? '';
        if (status === 401) {
          throw new Error('Admin key was rejected. Please log in again.');
        }
        if (status === 503) {
          throw new Error(
            apiError ||
              'Storage is not configured on the server. Set STORAGE_CONNECTION_STRING for the Function App.'
          );
        }
        throw new Error(
          apiError || `Could not get an upload URL (HTTP ${status ?? 'network error'}).`
        );
      }

      if (!sasRes.uploadUrl || !sasRes.publicUrl) {
        throw new Error('Server returned an empty upload URL.');
      }

      const contentType = file.type || 'application/octet-stream';
      let putRes: Response;
      try {
        putRes = await fetch(sasRes.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': contentType
          }
        });
      } catch (e: unknown) {
        throw new Error(
          'Browser could not reach Azure Blob Storage. This is usually a CORS or ' +
            'network issue. Confirm the storage account allows your origin under ' +
            '"Resource sharing (CORS)" for the Blob service.'
        );
      }

      if (!putRes.ok) {
        let azureMessage = '';
        try {
          const text = await putRes.text();
          const match = /<Message>([\s\S]*?)<\/Message>/i.exec(text);
          azureMessage = match?.[1]?.trim() ?? text.slice(0, 240);
        } catch {
          /* body unreadable — keep status */
        }
        throw new Error(
          `Upload failed (HTTP ${putRes.status})${azureMessage ? `: ${azureMessage}` : ''}`
        );
      }

      this.adminStorySlides.unshift({
        imageUrl: sasRes.publicUrl,
        title: 'New slide',
        caption: ''
      });
      this.adminSuccessMessage = 'Image uploaded.';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not upload image.';
      this.adminError = msg;
      console.error('Story image upload failed:', e);
    } finally {
      this.adminStoryUploading = false;
      input.value = '';
      this.cdr.markForCheck();
    }
  }

  protected onGuestSearchChange(): void {
    if (this.guestSearchTimer) {
      clearTimeout(this.guestSearchTimer);
    }
    const q = this.guestSearchQuery.trim();
    if (q.length < 2) {
      this.guestSearchResults = [];
      this.guestSearchLoading = false;
      this.cdr.markForCheck();
      return;
    }
    this.guestSearchTimer = setTimeout(() => {
      void this.runGuestSearch();
    }, 380);
  }

  protected selectGuest(g: GuestSearchResult): void {
    this.selectedGuest = g;
    this.attendingCount = g.invitedCount > 0 ? g.invitedCount : 1;
    this.attendance = '';
    this.attendingCountError = '';
    this.statusMessage = '';
    this.cdr.markForCheck();
  }

  protected clearGuestSelection(): void {
    this.selectedGuest = null;
    this.attendance = '';
    this.attendingCountError = '';
    this.statusMessage = '';
    this.cdr.markForCheck();
  }

  protected setAttendance(value: 'yes' | 'no'): void {
    this.attendance = value;
    this.attendingCountError = '';
    if (value === 'yes' && this.selectedGuest) {
      const max = this.selectedGuest.invitedCount;
      if (!Number.isFinite(this.attendingCount) || this.attendingCount < 1) {
        this.attendingCount = 1;
      } else if (this.attendingCount > max) {
        this.attendingCount = max;
      }
    }
    this.cdr.markForCheck();
  }

  protected onAttendingCountChange(): void {
    if (!this.selectedGuest || this.attendance !== 'yes') {
      this.attendingCountError = '';
      return;
    }
    const max = this.selectedGuest.invitedCount;
    const n = Math.floor(Number(this.attendingCount));
    if (!Number.isFinite(n) || n < 1) {
      this.attendingCountError = 'Enter at least 1 guest.';
    } else if (n > max) {
      this.attendingCountError = `Maximum ${max} (invited count).`;
    } else {
      this.attendingCountError = '';
    }
    this.cdr.markForCheck();
  }

  protected get canSubmitRsvp(): boolean {
    if (!this.selectedGuest || !this.attendance || this.submitting) {
      return false;
    }
    if (this.attendance === 'yes' && this.attendingCountError) {
      return false;
    }
    return true;
  }

  protected goToSection(index: number): void {
    if (index < 0 || index >= this.sections.length || index === this.activeSectionIndex) {
      return;
    }
    this.activeSectionIndex = index;
    // A section that had to scroll on a small screen starts at its top again.
    document.getElementById(this.sections[index].id)?.scrollTo(0, 0);
  }

  protected async submitRsvp(): Promise<void> {
    if (!this.hasApi) {
      this.statusMessage = 'RSVP is not configured. Set apiBaseUrl and run the API.';
      return;
    }

    if (!this.selectedGuest) {
      this.statusMessage = 'Please search and select your invitation from the list.';
      return;
    }
    if (!this.attendance) {
      this.statusMessage = 'Please choose Yes or No for attendance.';
      return;
    }

    if (this.attendance === 'yes') {
      this.onAttendingCountChange();
      if (this.attendingCountError) {
        this.statusMessage = this.attendingCountError;
        return;
      }
    }

    const invited = this.selectedGuest.invitedCount;
    let finalCount = 0;
    if (this.attendance === 'yes') {
      if (invited > 1) {
        const n = Math.floor(Number(this.attendingCount));
        if (!Number.isFinite(n) || n < 1 || n > invited) {
          this.statusMessage = `Number attending must be between 1 and ${invited}.`;
          return;
        }
        finalCount = n;
      } else {
        finalCount = 1;
      }
    }

    this.submitting = true;
    this.statusMessage = 'Sending RSVP...';

    try {
      const res = await firstValueFrom(
        this.http.post<{ ok?: boolean; error?: string }>(this.apiUrl('rsvp'), {
          guestId: this.selectedGuest.id,
          attendance: this.attendance,
          ...(this.attendance === 'yes' ? { attendingCount: finalCount } : {})
        })
      );
      if (res && (res as { ok?: boolean }).ok === false) {
        this.statusMessage = (res as { error?: string }).error ?? 'RSVP was not saved.';
        return;
      }
      this.statusMessage = 'Thank you! Your RSVP has been submitted.';
      this.clearGuestSelection();
      this.guestSearchQuery = '';
      this.guestSearchResults = [];
    } catch {
      this.statusMessage = 'Could not submit RSVP now. Please try again.';
    } finally {
      this.submitting = false;
      this.cdr.markForCheck();
    }
  }

  private apiUrl(path: string): string {
    const base = (this.config.apiBaseUrl ?? '').replace(/\/$/, '');
    const segment = path.replace(/^\//, '');
    if (base.startsWith('http')) {
      return `${base}/${segment}`;
    }
    return `${base}/${segment}`;
  }

  private async runGuestSearch(): Promise<void> {
    if (!this.hasApi) {
      this.guestSearchResults = [];
      return;
    }
    const q = this.guestSearchQuery.trim();
    if (q.length < 2) {
      this.guestSearchResults = [];
      return;
    }
    this.guestSearchLoading = true;
    this.cdr.markForCheck();
    const params = new HttpParams().set('q', q).set('limit', '40');
    try {
      const res = await firstValueFrom(
        this.http.get<{ guests?: GuestSearchResult[] }>(this.apiUrl('guests/search'), { params })
      );
      this.guestSearchResults = res.guests ?? [];
    } catch {
      this.guestSearchResults = [];
    } finally {
      this.guestSearchLoading = false;
      this.cdr.markForCheck();
    }
  }

  private buildCalendarCells(targetDate: Date): Array<number | null> {
    const firstDaySundayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1).getDay();
    const firstDay = (firstDaySundayStart + 6) % 7;
    const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
    const cells: Array<number | null> = [];

    for (let index = 0; index < firstDay; index += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(day);
    }

    return cells;
  }

}
