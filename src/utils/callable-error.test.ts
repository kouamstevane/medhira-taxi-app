import { getUserFacingCallableError } from './callable-error';

describe('getUserFacingCallableError', () => {
  it('turns Firebase callable permission failures into an actionable French message', () => {
    expect(getUserFacingCallableError({ code: 'functions/permission-denied' }))
      .toBe('Vous n’êtes pas autorisé à effectuer cette action.');
  });

  it('keeps a safe French message from a callable error', () => {
    expect(getUserFacingCallableError({ message: 'Le trajet n’est plus disponible.' }))
      .toBe('Le trajet n’est plus disponible.');
  });
});
