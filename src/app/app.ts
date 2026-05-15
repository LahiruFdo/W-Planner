import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, firstValueFrom, interval } from 'rxjs';
import { environment } from '../environments/environment';

export interface StorySlide {
  imageUrl: string;
  title: string;
  caption: string;
}

export interface GuestSearchResult {
  id: string;
  title: string;
  guestType: string;
  name: string;
  invitedCount: number;
}

export interface AdminGuest extends GuestSearchResult {
  confirmed?: string;
  isComing?: string;
  finalCount?: string;
}

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

  private static readonly defaultStorySlides: StorySlide[] = [
    {
      imageUrl:
        'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80',
      title: 'Where It Started',
      caption: 'A simple hello that turned into forever.'
    },
    {
      imageUrl:
        'https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80',
      title: 'Growing Together',
      caption: 'Every day became brighter side by side.'
    },
    {
      imageUrl:
        'https://images.unsplash.com/photo-1494774157365-9e04c6720e47?auto=format&fit=crop&w=1200&q=80',
      title: 'A Promise',
      caption: 'From laughter to love, from love to a promise.'
    },
    {
      imageUrl:
        'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80',
      title: 'Our Big Day',
      caption: 'Now we begin our new chapter with you.'
    }
  ];

  protected storySlides: StorySlide[] = [...App.defaultStorySlides];

  // Admin dashboard (served under `/admin` on the same SPA)
  protected adminKeyInput = '';
  protected adminAuthed = false;
  protected adminLoading = false;
  protected adminError = '';
  protected adminGuestsLoading = false;
  protected adminGuests: AdminGuest[] = [];
  protected adminNewGuest: {
    title: string;
    guestType: string;
    name: string;
    invitedCount: number;
    id?: string;
  } = {
    title: '',
    guestType: '',
    name: '',
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
  protected submitting = false;
  protected statusMessage = '';
  protected isStoryOpen = false;
  protected activeStoryIndex = 0;
  private storyAutoPlaySub: Subscription | null = null;
  private guestSearchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef
  ) {}

  protected get isAdminRoute(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.location.pathname.toLowerCase().startsWith('/admin');
  }

  async ngOnInit(): Promise<void> {
    await this.loadStorySlides();
    if (this.isAdminRoute) {
      const saved = window.sessionStorage.getItem('adminKey') ?? '';
      if (saved.trim()) {
        this.adminKeyInput = saved.trim();
        void this.adminTryAutoLogin();
      }
    }
  }

  ngOnDestroy(): void {
    this.stopStoryAutoPlay();
    if (this.guestSearchTimer) {
      clearTimeout(this.guestSearchTimer);
      this.guestSearchTimer = null;
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.isStoryOpen) {
      this.closeStory();
    }
  }

  protected get hasApi(): boolean {
    return Boolean(this.config.apiBaseUrl?.trim());
  }

  private adminHeaders(): HttpHeaders {
    return new HttpHeaders({ 'x-admin-key': this.adminKeyInput });
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
        this.http.get<{ guests?: AdminGuest[] }>(this.apiUrl('admin/guests'), {
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
      this.adminError = e?.error?.error ?? 'Admin authentication failed.';
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
        this.http.get<{ guests?: AdminGuest[] }>(this.apiUrl('admin/guests'), {
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

    const payload = {
      id: (g.id ?? '').trim() || undefined,
      title: g.title ?? '',
      guestType: g.guestType ?? '',
      name: g.name ?? '',
      invitedCount: Number(g.invitedCount)
    };

    try {
      await firstValueFrom(
        this.http.put(this.apiUrl('admin/guests'), payload, {
          headers: this.adminHeaders()
        })
      );
      await this.adminRefreshGuests();
    } catch {
      this.adminError = 'Could not save guest.';
    }
  }

  protected async adminAddNewGuest(): Promise<void> {
    if (!this.adminAuthed) {
      return;
    }
    this.adminError = '';

    const payload = {
      title: this.adminNewGuest.title ?? '',
      guestType: this.adminNewGuest.guestType ?? '',
      name: this.adminNewGuest.name ?? '',
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

    try {
      await firstValueFrom(
        this.http.put(this.apiUrl('admin/guests'), payload, {
          headers: this.adminHeaders()
        })
      );
      this.adminNewGuest = { title: '', guestType: '', name: '', invitedCount: 1 };
      await this.adminRefreshGuests();
    } catch {
      this.adminError = 'Could not add guest.';
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
        this.http.put(this.apiUrl('admin/story'), { slides: this.adminStorySlides }, { headers: this.adminHeaders() })
      );
    } catch {
      this.adminError = 'Could not save story.';
    } finally {
      this.adminStorySaving = false;
      this.cdr.markForCheck();
      // Keep home story modal in sync
      await this.loadStorySlides();
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
      const sasRes = await firstValueFrom(
        this.http.post<{ uploadUrl?: string; publicUrl?: string }>(
          this.apiUrl('admin/images/sas'),
          { fileName: file.name, contentType: file.type },
          { headers: this.adminHeaders() }
        )
      );

      if (!sasRes.uploadUrl || !sasRes.publicUrl) {
        throw new Error('Missing uploadUrl/publicUrl');
      }

      const putRes = await fetch(sasRes.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': file.type
        }
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed with status ${putRes.status}`);
      }

      this.adminStorySlides.unshift({
        imageUrl: sasRes.publicUrl,
        title: 'New slide',
        caption: ''
      });
    } catch {
      this.adminError = 'Could not upload image.';
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
    this.statusMessage = '';
    this.cdr.markForCheck();
  }

  protected clearGuestSelection(): void {
    this.selectedGuest = null;
    this.attendance = '';
    this.statusMessage = '';
    this.cdr.markForCheck();
  }

  protected openStory(): void {
    this.activeStoryIndex = 0;
    this.isStoryOpen = true;
    document.body.style.overflow = 'hidden';
    this.startStoryAutoPlay();
  }

  protected closeStory(): void {
    this.isStoryOpen = false;
    document.body.style.overflow = '';
    this.stopStoryAutoPlay();
  }

  protected nextStory(): void {
    this.activeStoryIndex = (this.activeStoryIndex + 1) % this.storySlides.length;
    this.restartStoryAutoPlay();
  }

  protected previousStory(): void {
    this.activeStoryIndex =
      (this.activeStoryIndex - 1 + this.storySlides.length) % this.storySlides.length;
    this.restartStoryAutoPlay();
  }

  protected goToStory(index: number): void {
    this.activeStoryIndex = index;
    this.restartStoryAutoPlay();
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

  private async loadStorySlides(): Promise<void> {
    if (!this.hasApi) {
      return;
    }
    try {
      const res = await firstValueFrom(
        this.http.get<{ slides?: StorySlide[] }>(this.apiUrl('story'))
      );
      const slides = res.slides?.filter((s) => s.imageUrl?.trim() && s.title?.trim()) ?? [];
      if (slides.length > 0) {
        this.storySlides = slides.map((s) => ({
          imageUrl: s.imageUrl.trim(),
          title: s.title.trim(),
          caption: (s.caption ?? '').trim()
        }));
        this.cdr.markForCheck();
      }
    } catch {
      /* keep built-in defaults */
    }
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

  private startStoryAutoPlay(): void {
    this.stopStoryAutoPlay();
    this.storyAutoPlaySub = interval(2600).subscribe(() => {
      if (!this.isStoryOpen) {
        return;
      }
      this.activeStoryIndex = (this.activeStoryIndex + 1) % this.storySlides.length;
      this.cdr.markForCheck();
    });
  }

  private stopStoryAutoPlay(): void {
    if (this.storyAutoPlaySub) {
      this.storyAutoPlaySub.unsubscribe();
      this.storyAutoPlaySub = null;
    }
  }

  private restartStoryAutoPlay(): void {
    if (this.isStoryOpen) {
      this.startStoryAutoPlay();
    }
  }
}
