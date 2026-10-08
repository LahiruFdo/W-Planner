import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should show the cover until "View Invitation" is tapped', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.invite-cover')).toBeTruthy();
    expect(compiled.querySelector('h2')).toBeNull();

    (compiled.querySelector('.cover-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(compiled.querySelector('h2')?.textContent).toContain('Wedding Details');
  });
});
