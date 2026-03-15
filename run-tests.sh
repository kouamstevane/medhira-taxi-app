#!/bin/bash
# Script Linux/macOS pour exécuter les tests de l'inscription par téléphone
# 
# Usage:
#   ./run-tests.sh              - Exécuter tous les tests
#   ./run-tests.sh unit         - Exécuter uniquement les tests unitaires
#   ./run-tests.sh integration  - Exécuter uniquement les tests d'intégration
#   ./run-tests.sh e2e          - Exécuter uniquement les tests E2E
#   ./run-tests.sh performance  - Exécuter uniquement les tests de performance
#   ./run-tests.sh security     - Exécuter uniquement les tests de sécurité
#   ./run-tests.sh coverage     - Exécuter avec rapport de couverture
#   ./run-tests.sh watch        - Exécuter en mode watch (re-exécute sur changements)

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   🧪 Suite de Tests - Inscription par Téléphone               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Fonction pour afficher le message de fin
show_end_message() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║   📊 Consultez les rapports dans test-reports/                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
}

# Vérifier si un argument est passé
if [ -z "$1" ]; then
    echo "📋 Exécution de TOUS les tests..."
    echo ""
    npm test
    show_end_message
    exit 0
fi

# Gérer les différents arguments
case "$1" in
    unit)
        echo "📘 Exécution des tests UNITAIRES..."
        echo ""
        npm test -- --testPathPattern=unit
        ;;
    integration)
        echo "📙 Exécution des tests d'INTÉGRATION..."
        echo ""
        npm test -- --testPathPattern=integration
        ;;
    e2e)
        echo "📗 Exécution des tests END-TO-END..."
        echo ""
        npm test -- --testPathPattern=e2e
        ;;
    performance)
        echo "⚡ Exécution des tests de PERFORMANCE..."
        echo ""
        npm test -- --testPathPattern=performance
        ;;
    security)
        echo "🔒 Exécution des tests de SÉCURITÉ..."
        echo ""
        npm test -- --testPathPattern=security
        ;;
    coverage)
        echo "📊 Exécution avec COUVERTURE DE CODE..."
        echo ""
        npm run test:coverage
        echo ""
        echo " Rapport de couverture généré dans coverage/lcov-report/index.html"
        ;;
    watch)
        echo "👁️  Exécution en mode WATCH..."
        echo ""
        npm test -- --watch
        ;;
    ci)
        echo "🤖 Exécution en mode CI..."
        echo ""
        npm run test:ci
        ;;
    *)
        echo "Argument non reconnu: $1"
        echo ""
        echo "Arguments valides:"
        echo "  - unit         : Tests unitaires uniquement"
        echo "  - integration  : Tests d'intégration uniquement"
        echo "  - e2e          : Tests end-to-end uniquement"
        echo "  - performance  : Tests de performance uniquement"
        echo "  - security     : Tests de sécurité uniquement"
        echo "  - coverage     : Tous les tests avec couverture de code"
        echo "  - watch        : Mode watch (re-exécute sur changements)"
        echo "  - ci           : Mode CI (intégration continue)"
        echo ""
        exit 1
        ;;
esac

show_end_message
