/**
 * Système de Logging et Collecte d'Erreurs pour les Tests
 * 
 * Utilitaire pour collecter, journaliser et formatter les erreurs
 * rencontrées pendant l'exécution des tests
 * 
 * @module utils/test-logger
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TestError {
  timestamp: string;
  testName: string;
  testFile: string;
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  context: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface TestReport {
  runId: string;
  startTime: string;
  endTime?: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  errors: TestError[];
  performance: {
    totalDuration: number;
    averageTestDuration: number;
    slowestTests: Array<{ name: string; duration: number }>;
  };
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
}

export class TestLogger {
  private static instance: TestLogger;
  private errors: TestError[] = [];
  private report: TestReport;
  private testStartTimes: Map<string, number> = new Map();
  private testDurations: Array<{ name: string; duration: number }> = [];

  private constructor() {
    this.report = {
      runId: this.generateRunId(),
      startTime: new Date().toISOString(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      errors: [],
      performance: {
        totalDuration: 0,
        averageTestDuration: 0,
        slowestTests: [],
      },
    };
  }

  public static getInstance(): TestLogger {
    if (!TestLogger.instance) {
      TestLogger.instance = new TestLogger();
    }
    return TestLogger.instance;
  }

  private generateRunId(): string {
    return `test-run-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Enregistrer le début d'un test
   */
  public testStarted(testname: string): void {
    this.testStartTimes.set(testname, Date.now());
    this.report.totalTests++;
  }

  /**
   * Enregistrer la fin d'un test avec succès
   */
  public testPassed(testName: string): void {
    this.report.passedTests++;
    this.recordTestDuration(testName);
  }

  /**
   * Enregistrer la fin d'un test avec échec
   */
  public testFailed(testName: string): void {
    this.report.failedTests++;
    this.recordTestDuration(testName);
  }

  /**
   * Enregistrer un test ignoré
   */
  public testSkipped(testName: string): void {
    this.report.skippedTests++;
  }

  /**
   * Enregistrer la durée d'un test
   */
  private recordTestDuration(testName: string): void {
    const startTime = this.testStartTimes.get(testName);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.testDurations.push({ name: testName, duration });
      this.testStartTimes.delete(testName);
    }
  }

  /**
   * Logger une erreur avec contexte complet
   */
  public logError(params: {
    testName: string;
    testFile: string;
    error: Error | unknown;
    context?: Record<string, unknown>;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  }): void {
    const error = params.error as Error;
    
    const testError: TestError = {
      timestamp: new Date().toISOString(),
      testName: params.testName,
      testFile: params.testFile,
      errorType: error.name || 'UnknownError',
      errorMessage: error.message || 'No error message',
      stackTrace: error.stack,
      context: params.context || {},
      severity: params.severity || this.determineSeverity(error),
    };

    this.errors.push(testError);
    this.report.errors.push(testError);

    // Logger immédiatement dans la console en mode verbose
    this.logToConsole(testError);
  }

  /**
   * Déterminer automatiquement la sévérité d'une erreur
   */
  private determineSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical' {
    const message = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';

    if (message.includes('security') || message.includes('authentication') || message.includes('unauthorized')) {
      return 'critical';
    }
    if (message.includes('network') || message.includes('timeout') || name.includes('timeout')) {
      return 'high';
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Logger dans la console avec formatage coloré
   */
  private logToConsole(error: TestError): void {
    const severityEmoji = {
      low: '📘',
      medium: '📙',
      high: '📕',
      critical: '🚨',
    };

    console.error(`
${severityEmoji[error.severity]} ERREUR [${error.severity.toUpperCase()}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Test: ${error.testName}
📄 Fichier: ${error.testFile}
⏰ Timestamp: ${error.timestamp}
🔴 Type: ${error.errorType}
💬 Message: ${error.errorMessage}

📊 Contexte:
${JSON.stringify(error.context, null, 2)}

📚 Stack Trace:
${error.stackTrace || 'Pas de stack trace disponible'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  }

  /**
   * Finaliser le rapport et calculer les statistiques
   */
  public finalizeReport(): TestReport {
    this.report.endTime = new Date().toISOString();

    // Calculer les statistiques de performance
    if (this.testDurations.length > 0) {
      const totalDuration = this.testDurations.reduce((sum, t) => sum + t.duration, 0);
      this.report.performance.totalDuration = totalDuration;
      this.report.performance.averageTestDuration = totalDuration / this.testDurations.length;
      
      // Top 10 des tests les plus lents
      this.report.performance.slowestTests = this.testDurations
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10);
    }

    return this.report;
  }

  /**
   * Sauvegarder le rapport dans un fichier JSON
   */
  public async saveReport(outputDir: string = './test-reports'): Promise<string> {
    const report = this.finalizeReport();
    
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = `test-report-${report.runId}.json`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`\n📊 Rapport de test sauvegardé: ${filepath}`);
    
    return filepath;
  }

  /**
   * Générer un rapport HTML lisible
   */
  public async generateHTMLReport(outputDir: string = './test-reports'): Promise<string> {
    const report = this.finalizeReport();
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const html = this.generateHTML(report);
    const filename = `test-report-${report.runId}.html`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, html, 'utf-8');

    console.log(`\n📊 Rapport HTML généré: ${filepath}`);
    
    return filepath;
  }

  /**
   * Générer le contenu HTML du rapport
   */
  private generateHTML(report: TestReport): string {
    const successRate = ((report.passedTests / report.totalTests) * 100).toFixed(2);
    const failureRate = ((report.failedTests / report.totalTests) * 100).toFixed(2);

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport de Tests - ${report.runId}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 2em;
      margin-bottom: 10px;
    }
    .header p {
      opacity: 0.9;
      font-size: 1.1em;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      padding: 30px;
      background: #f8f9fa;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      text-align: center;
    }
    .stat-card h3 {
      color: #666;
      font-size: 0.9em;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .stat-card .value {
      font-size: 2.5em;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .stat-card.success .value { color: #28a745; }
    .stat-card.danger .value { color: #dc3545; }
    .stat-card.warning .value { color: #ffc107; }
    .stat-card.info .value { color: #17a2b8; }
    .section {
      padding: 30px;
    }
    .section h2 {
      margin-bottom: 20px;
      color: #667eea;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .error-list {
      list-style: none;
    }
    .error-item {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin-bottom: 15px;
      border-radius: 4px;
    }
    .error-item.critical {
      background: #f8d7da;
      border-left-color: #dc3545;
    }
    .error-item.high {
      background: #fff3cd;
      border-left-color: #fd7e14;
    }
    .error-item h4 {
      margin-bottom: 8px;
      color: #333;
    }
    .error-meta {
      font-size: 0.85em;
      color: #666;
      margin-bottom: 10px;
    }
    .error-message {
      background: rgba(0,0,0,0.05);
      padding: 10px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      margin-top: 10px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .performance-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    .performance-table th,
    .performance-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #dee2e6;
    }
    .performance-table th {
      background: #667eea;
      color: white;
      font-weight: 600;
    }
    .performance-table tr:hover {
      background: #f8f9fa;
    }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75em;
      font-weight: bold;
      text-transform: uppercase;
    }
    .badge.success { background: #d4edda; color: #155724; }
    .badge.danger { background: #f8d7da; color: #721c24; }
    .badge.warning { background: #fff3cd; color: #856404; }
    .badge.critical { background: #dc3545; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Rapport de Tests - Inscription par Téléphone</h1>
      <p>ID: ${report.runId}</p>
      <p>Période: ${report.startTime} - ${report.endTime || 'En cours...'}</p>
    </div>

    <div class="stats">
      <div class="stat-card info">
        <h3>Total Tests</h3>
        <div class="value">${report.totalTests}</div>
      </div>
      <div class="stat-card success">
        <h3>Réussis</h3>
        <div class="value">${report.passedTests}</div>
        <div class="badge success">${successRate}%</div>
      </div>
      <div class="stat-card danger">
        <h3>Échoués</h3>
        <div class="value">${report.failedTests}</div>
        <div class="badge danger">${failureRate}%</div>
      </div>
      <div class="stat-card warning">
        <h3>Ignorés</h3>
        <div class="value">${report.skippedTests}</div>
      </div>
    </div>

    <div class="section">
      <h2>⚡ Performance</h2>
      <p><strong>Durée totale:</strong> ${(report.performance.totalDuration / 1000).toFixed(2)}s</p>
      <p><strong>Durée moyenne par test:</strong> ${report.performance.averageTestDuration.toFixed(2)}ms</p>
      
      ${report.performance.slowestTests.length > 0 ? `
        <h3 style="margin-top: 20px;">Tests les plus lents</h3>
        <table class="performance-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nom du Test</th>
              <th>Durée</th>
            </tr>
          </thead>
          <tbody>
            ${report.performance.slowestTests.map((test, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${test.name}</td>
                <td>${test.duration}ms</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
    </div>

    ${report.errors.length > 0 ? `
      <div class="section">
        <h2>🔴 Erreurs Détaillées (${report.errors.length})</h2>
        <ul class="error-list">
          ${report.errors.map((error) => `
            <li class="error-item ${error.severity}">
              <h4>
                <span class="badge ${error.severity}">${error.severity}</span>
                ${error.testName}
              </h4>
              <div class="error-meta">
                📄 ${error.testFile} | ⏰ ${error.timestamp} | 🔴 ${error.errorType}
              </div>
              <p><strong>Message:</strong> ${error.errorMessage}</p>
              ${Object.keys(error.context).length > 0 ? `
                <p><strong>Contexte:</strong></p>
                <div class="error-message">${JSON.stringify(error.context, null, 2)}</div>
              ` : ''}
              ${error.stackTrace ? `
                <details>
                  <summary><strong>Stack Trace</strong></summary>
                  <div class="error-message">${error.stackTrace}</div>
                </details>
              ` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    ` : ''}

    ${report.coverage ? `
      <div class="section">
        <h2>📈 Couverture de Code</h2>
        <div class="stats">
          <div class="stat-card">
            <h3>Lignes</h3>
            <div class="value">${report.coverage.lines}%</div>
          </div>
          <div class="stat-card">
            <h3>Fonctions</h3>
            <div class="value">${report.coverage.functions}%</div>
          </div>
          <div class="stat-card">
            <h3>Branches</h3>
            <div class="value">${report.coverage.branches}%</div>
          </div>
          <div class="stat-card">
            <h3>Instructions</h3>
            <div class="value">${report.coverage.statements}%</div>
          </div>
        </div>
      </div>
    ` : ''}
  </div>
</body>
</html>
    `;
  }

  /**
   * Afficher un résumé dans la console
   */
  public printSummary(): void {
    const report = this.finalizeReport();
    const successRate = ((report.passedTests / report.totalTests) * 100).toFixed(2);

    console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                    📊 RÉSUMÉ DES TESTS                                ║
╠═══════════════════════════════════════════════════════════════════════╣
║ ID de l'exécution: ${report.runId.padEnd(48)} ║
║ Début: ${report.startTime.padEnd(57)} ║
║ Fin: ${(report.endTime || 'En cours...').padEnd(59)} ║
╠═══════════════════════════════════════════════════════════════════════╣
║ Total de tests: ${String(report.totalTests).padEnd(53)} ║
║  Réussis: ${String(report.passedTests).padEnd(57)} ║
║ Échoués: ${String(report.failedTests).padEnd(57)} ║
║ ⏭️  Ignorés: ${String(report.skippedTests).padEnd(57)} ║
║ 📈 Taux de réussite: ${(successRate + '%').padEnd(49)} ║
╠═══════════════════════════════════════════════════════════════════════╣
║ ⚡ Durée totale: ${(report.performance.totalDuration / 1000).toFixed(2)}s${' '.repeat(44)} ║
║ ⏱️  Durée moyenne: ${report.performance.averageTestDuration.toFixed(2)}ms${' '.repeat(43)} ║
╠═══════════════════════════════════════════════════════════════════════╣
║ 🔴 Erreurs critiques: ${report.errors.filter(e => e.severity === 'critical').length}${' '.repeat(44)} ║
║ 📕 Erreurs hautes: ${report.errors.filter(e => e.severity === 'high').length}${' '.repeat(47)} ║
║ 📙 Erreurs moyennes: ${report.errors.filter(e => e.severity === 'medium').length}${' '.repeat(45)} ║
║ 📘 Erreurs basses: ${report.errors.filter(e => e.severity === 'low').length}${' '.repeat(47)} ║
╚═══════════════════════════════════════════════════════════════════════╝
    `);
  }

  /**
   * Réinitialiser le logger pour une nouvelle exécution
   */
  public reset(): void {
    this.errors = [];
    this.testStartTimes.clear();
    this.testDurations = [];
    this.report = {
      runId: this.generateRunId(),
      startTime: new Date().toISOString(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      errors: [],
      performance: {
        totalDuration: 0,
        averageTestDuration: 0,
        slowestTests: [],
      },
    };
  }
}

// Export d'une instance singleton
export const testLogger = TestLogger.getInstance();

// Utilitaires helper
export const logTestError = (params: Parameters<typeof testLogger.logError>[0]) => {
  testLogger.logError(params);
};

export const saveTestReport = async (outputDir?: string) => {
  return await testLogger.saveReport(outputDir);
};

export const generateHTMLReport = async (outputDir?: string) => {
  return await testLogger.generateHTMLReport(outputDir);
};
