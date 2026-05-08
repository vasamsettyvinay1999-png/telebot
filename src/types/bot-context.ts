import type { Context } from 'telegraf';
import type { AppUser, SessionState } from './session.js';

export type AppContext = Context & {
  session: SessionState;
  state: {
    user?: AppUser;
  };
};

