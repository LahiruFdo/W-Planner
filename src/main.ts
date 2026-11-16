import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';

// /hcinvites is a separate page (Home Coming & Housewarming invitations);
// every other path is the wedding invitation.
const isHcInvites = window.location.pathname.toLowerCase().replace(/\/+$/, '') === '/hcinvites';

const root = isHcInvites
  ? import('./app/hc-invites/hc-invites').then((m) => m.HcInvites)
  : import('./app/app').then((m) => m.App);

root
  .then((component) => bootstrapApplication(component, appConfig))
  .catch((err) => console.error(err));
