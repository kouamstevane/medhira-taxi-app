import {
  getCountryByCode,
  getCountryByDialCode,
  getCountryByName,
  getCountryCodeFromDialCode,
  getDialCodeForCountryCode,
  getDialCodeForCountryName,
  getDialCodeFromPhone,
} from '../identity-utils';

describe('identity-utils', () => {
  it('returns the expected dial code for supported country codes', () => {
    expect(getDialCodeForCountryCode('CM')).toBe('+237');
    expect(getDialCodeForCountryCode('FR')).toBe('+33');
    expect(getDialCodeForCountryCode('unknown')).toBe('');
  });

  it('returns the expected dial code for supported country names', () => {
    expect(getDialCodeForCountryName('Cameroun')).toBe('+237');
    expect(getDialCodeForCountryName('Canada')).toBe('+1');
    expect(getDialCodeForCountryName('Pays inconnu')).toBe('');
  });

  it('detects country codes from phone numbers', () => {
    expect(getCountryCodeFromDialCode('+237655744484')).toBe('CM');
    expect(getCountryCodeFromDialCode('+33612345678')).toBe('FR');
    expect(getCountryCodeFromDialCode('+1 (242) 555-0100')).toBe('BS');
    expect(getCountryCodeFromDialCode('+1 (514) 000-0000')).toBe('CA');
    expect(getCountryCodeFromDialCode('')).toBeNull();
  });

  it('detects dial codes from phone numbers', () => {
    expect(getDialCodeFromPhone('+237655744484')).toBe('+237');
    expect(getDialCodeFromPhone('+15550123456')).toBe('+1');
    expect(getDialCodeFromPhone('12345')).toBeNull();
  });

  it('resolves countries by code and name', () => {
    expect(getCountryByCode('BE')?.name).toBe('Belgique');
    expect(getCountryByDialCode('+237')?.code).toBe('CM');
    expect(getCountryByName('France')?.code).toBe('FR');
    expect(getCountryByName('')).toBeNull();
  });
});
