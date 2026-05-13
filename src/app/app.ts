import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
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

  protected guestName = '';
  protected attendance = '';
  protected submitting = false;
  protected statusMessage = '';
  protected isStoryOpen = false;
  protected activeStoryIndex = 0;
  private storyAutoPlaySub: Subscription | null = null;
  protected readonly storySlides = [
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

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef
  ) {}

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.isStoryOpen) {
      this.closeStory();
    }
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

  protected ngOnDestroy(): void {
    this.stopStoryAutoPlay();
  }

  protected async submitRsvp(): Promise<void> {
    if (!this.guestName.trim() || !this.attendance) {
      this.statusMessage = 'Please enter your name and attendance.';
      return;
    }

    if (!this.config.googleApiUrl) {
      this.statusMessage = 'Google API URL is missing in environment config.';
      return;
    }

    this.submitting = true;
    this.statusMessage = 'Sending RSVP...';

    try {
      await this.http
        .post(this.config.googleApiUrl, {
          guestName: this.guestName.trim(),
          attendance: this.attendance,
          brideName: this.brideName,
          groomName: this.groomName,
          submittedAt: new Date().toISOString()
        })
        .toPromise();

      this.statusMessage = 'Thank you! Your RSVP has been submitted.';
      this.guestName = '';
      this.attendance = '';
    } catch {
      this.statusMessage = 'Could not submit RSVP now. Please try again.';
    } finally {
      this.submitting = false;
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
