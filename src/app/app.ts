import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, HostBinding, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Subscription, firstValueFrom, interval } from 'rxjs';
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
  protected isStoryOpen = false;
  protected activeStoryIndex = 0;
  private storyAutoPlaySub: Subscription | null = null;
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

  protected nameLetterDelay(index: number, offset = 0): string {
    return `${(offset + index) * 90}ms`;
  }

  private get lastLetterStartMs(): number {
    const totalLetters = this.brideLetters.length + this.groomLetters.length + 1;
    return (totalLetters - 1) * 90;
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
   * Build an SVG data URI showing "{B}&{G}" — the first letters of the bride
   * and groom names separated by an ampersand — for use as a browser tab icon.
   */
  private buildFaviconDataUri(brideInitial: string, groomInitial: string): string {
    const safeBride = (brideInitial || 'B').toUpperCase();
    const safeGroom = (groomInitial || 'G').toUpperCase();
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
      `<rect width="64" height="64" rx="14" fill="#6b4a8f"/>` +
      `<text x="32" y="44" text-anchor="middle" ` +
      `font-family="Georgia, 'Playfair Display', serif" font-size="34" font-weight="700" fill="#ffffff">` +
      `${safeBride}<tspan font-size="22" dx="0" dy="-2" fill="#dcc8f0">&amp;</tspan>` +
      `<tspan dy="2">${safeGroom}</tspan>` +
      `</text>` +
      `</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  /**
   * Set the browser tab title and favicon to reflect the couple's initials
   * (e.g. "S & L · Wedding").
   */
  private applyBrowserBranding(): void {
    const brideInitial = (this.brideName ?? '').trim().charAt(0).toUpperCase();
    const groomInitial = (this.groomName ?? '').trim().charAt(0).toUpperCase();
    if (brideInitial && groomInitial) {
      this.titleService.setTitle(`${brideInitial} & ${groomInitial} · Wedding`);
    } else {
      this.titleService.setTitle('Wedding Invitation');
    }

    if (typeof document === 'undefined') {
      return;
    }
    const href = this.buildFaviconDataUri(brideInitial, groomInitial);
    let link = document.getElementById('app-favicon') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = 'app-favicon';
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = href;
  }

  protected get isAdminRoute(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.location.pathname.toLowerCase().startsWith('/admin');
  }

  async ngOnInit(): Promise<void> {
    this.applyBrowserBranding();
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
    } catch {
      this.adminError = 'Could not save guest.';
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
    } catch {
      this.adminError = 'Could not add guest.';
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
    } catch {
      this.adminError = 'Could not delete guest.';
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
          this.apiUrl('manage/images/sas'),
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
