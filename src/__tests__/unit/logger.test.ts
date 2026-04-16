import {
  StructuredLogger,
  createLogger,
  configureLogger,
} from '@/utils/logger';

describe('createLogger', () => {
  it('crée une instance avec le contexte et userId corrects', () => {
    const log = createLogger('TestContext', 'user123');
    const spy = jest.spyOn(console, 'log').mockImplementation();

    log.logStart('testOp');

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[TestContext]'),
      expect.objectContaining({
        context: 'TestContext',
        userId: 'user123',
      })
    );

    spy.mockRestore();
  });

  it('crée une instance sans userId', () => {
    const log = createLogger('TestContext');
    const spy = jest.spyOn(console, 'log').mockImplementation();

    log.logStart('testOp');

    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        userId: null,
      })
    );

    spy.mockRestore();
  });
});

describe('StructuredLogger', () => {
  let log: StructuredLogger;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    log = new StructuredLogger('user1', 'TestContext');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    configureLogger({ logToConsole: true, externalLogger: undefined });
  });

  describe('logStart', () => {
    it('log via console.log avec le statut START', () => {
      log.logStart('myOperation');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('DÉBUT'),
        expect.objectContaining({
          status: 'START',
          operation: 'myOperation',
          context: 'TestContext',
          userId: 'user1',
        })
      );
    });
  });

  describe('logSuccess', () => {
    it('log via console.log avec le statut SUCCESS', () => {
      log.logSuccess('myOperation');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('SUCCÈS'),
        expect.objectContaining({
          status: 'SUCCESS',
          operation: 'myOperation',
        })
      );
    });
  });

  describe('logError', () => {
    it('log via console.error avec les détails de l\'erreur', () => {
      const error = new Error('test error');
      log.logError('myOperation', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERREUR'),
        expect.objectContaining({
          status: 'ERROR',
          errorMessage: 'test error',
          stack: expect.any(String),
        })
      );
    });
  });

  describe('logWarning', () => {
    it('log via console.warn avec le statut WARNING', () => {
      log.logWarning('myOperation', 'attention!');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('AVERTISSEMENT'),
        expect.objectContaining({
          status: 'WARNING',
          message: 'attention!',
        })
      );
    });
  });

  describe('setUserId', () => {
    it('met à jour le userId', () => {
      log.setUserId('newUser');
      log.logStart('op');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ userId: 'newUser' })
      );
    });
  });

  describe('setContext', () => {
    it('met à jour le contexte', () => {
      log.setContext('NewContext');
      log.logStart('op');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NewContext]'),
        expect.objectContaining({ context: 'NewContext' })
      );
    });
  });

  describe('debug', () => {
    it('ne log pas en production', () => {
      const originalEnv = process.env.NODE_ENV;
      (process.env as Record<string, string>).NODE_ENV = 'production';

      log.debug('debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();

      (process.env as Record<string, string>).NODE_ENV = originalEnv ?? '';
    });

    it('log en développement', () => {
      const originalEnv = process.env.NODE_ENV;
      (process.env as Record<string, string>).NODE_ENV = 'development';

      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
      log.debug('debug message');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO'),
        expect.objectContaining({
          status: 'DEBUG',
          operation: 'debug message',
        })
      );

      consoleDebugSpy.mockRestore();
      (process.env as Record<string, string>).NODE_ENV = originalEnv ?? '';
    });
  });
});

describe('configureLogger', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    configureLogger({ logToConsole: true, externalLogger: undefined });
  });

  it('désactive le logging console quand logToConsole est false', () => {
    configureLogger({ logToConsole: false });

    const log = createLogger('Test');
    log.logStart('op');

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('utilise un logger externe quand configuré', () => {
    const externalInfo = jest.fn();
    configureLogger({
      logToConsole: false,
      externalLogger: {
        info: externalInfo,
        warn: jest.fn(),
        error: jest.fn(),
      },
    });

    const log = createLogger('Test');
    log.logStart('op');

    expect(externalInfo).toHaveBeenCalledWith(
      expect.stringContaining('[Test]'),
      expect.objectContaining({ status: 'START' })
    );
  });
});
