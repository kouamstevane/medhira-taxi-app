import { common } from './common';
import { auth } from './auth';
import { taxi } from './taxi';
import { colis } from './colis';
import { food } from './food';
import { client } from './client';
import { driver } from './driver';
import { wallet } from './wallet';
import { profile } from './profile';
import { errors } from './errors';
import { personalDriver } from './personalDriver';
import { notifications } from './notifications';
import { history } from './history';
import { restaurant } from './restaurant';
import type { DeepString } from '../types';

export const fr = {
  common,
  auth,
  taxi,
  colis,
  food,
  client,
  driver,
  wallet,
  profile,
  errors,
  personalDriver,
  notifications,
  history,
  restaurant,
} as const;

export type TranslationSchema = DeepString<typeof fr>;
