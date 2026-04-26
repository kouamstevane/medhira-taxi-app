#!/bin/bash

# ============================================================================
# Script de déploiement des fonctions d'envoi d'emails via Resend
# ============================================================================
# Ce script déploie les fonctions Firebase mises à jour qui utilisent
# Firebase Secret Manager pour les secrets (approche Functions v2).
#
# Utilisation:
#   ./deploy-email-functions.sh
#
# Prérequis:
#   - Firebase CLI installé
#   - Connecté à Firebase (firebase login)
#   - Clé API Resend disponible
#   - Secrets configurés dans Firebase Secret Manager
# ============================================================================

set -e  # Arrêter le script en cas d'erreur

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# Vérification des prérequis
# ============================================================================
log_info "Vérification des prérequis..."

# Vérifier que Firebase CLI est installé
if ! command -v firebase &> /dev/null; then
    log_error "Firebase CLI n'est pas installé. Installez-le avec: npm install -g firebase-tools"
    exit 1
fi

# Vérifier que l'utilisateur est connecté à Firebase
if ! firebase login:list &> /dev/null; then
    log_warning "Vous n'êtes pas connecté à Firebase. Connexion en cours..."
    firebase login
fi

# ============================================================================
# Vérification de la configuration des secrets
# ============================================================================
log_info "Vérification de la configuration des secrets..."

# Vérifier si les secrets existent déjà
log_info "Vérification des secrets Firebase Secret Manager..."
if ! firebase secrets:list &> /dev/null; then
    log_warning "Impossible de lister les secrets. Assurez-vous d'avoir les permissions nécessaires."
fi

# ============================================================================
# Chargement de la configuration
# ============================================================================
log_info "Chargement de la configuration..."

if [ -f .env ]; then
    source .env
    log_success "Fichier .env chargé"
else
    log_warning "Fichier .env non trouvé. Utilisation des valeurs par défaut."
fi

# ============================================================================
# Configuration des secrets (si nécessaire)
# ============================================================================
echo ""
log_info "============================================================================"
log_info "CONFIGURATION DES SECRETS FIREBASE SECRET MANAGER"
log_info "============================================================================"
echo ""
log_info "Les secrets suivants sont requis pour le déploiement:"
echo "  - RESEND_API_KEY: Clé API Resend pour l'envoi d'emails"
echo "  - AGORA_APP_ID: ID d'application Agora (pour VoIP)"
echo "  - AGORA_APP_CERTIFICATE: Certificat Agora (pour VoIP)"
echo "  - ENCRYPTION_MASTER_KEY: Clé de chiffrement maître"
echo ""
log_info "Si les secrets ne sont pas encore configurés, exécutez d'abord:"
echo "  ./setup-secrets.sh"
echo ""

# Demander si l'utilisateur veut configurer les secrets maintenant
read -p "Voulez-vous configurer les secrets maintenant? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    log_info "Configuration de RESEND_API_KEY..."
    echo -n "Entrez votre clé API Resend (re_xxxxxxxxxxxxx): "
    read -s RESEND_API_KEY
    echo
    
    # Vérifier le format de la clé API
    if [[ ! $RESEND_API_KEY =~ ^re_[a-zA-Z0-9]{32}$ ]]; then
        log_warning "Le format de la clé API Resend semble incorrect. Format attendu: re_xxxxxxxxxxxxx"
        echo -n "Voulez-vous continuer quand même? (y/n): "
        read -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_error "Configuration annulée."
            exit 1
        fi
    fi
    
    # Ajouter le secret à Secret Manager
    echo "$RESEND_API_KEY" | firebase secrets:add RESEND_API_KEY
    if [ $? -ne 0 ]; then
        log_error "Erreur lors de l'ajout du secret RESEND_API_KEY"
        exit 1
    fi
    log_success "Secret RESEND_API_KEY configuré avec succès"
    
    # Demander les autres secrets si nécessaires
    echo ""
    read -p "Voulez-vous configurer les secrets Agora? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -n "Entrez votre Agora App ID: "
        read AGORA_APP_ID
        echo "$AGORA_APP_ID" | firebase secrets:add AGORA_APP_ID
        
        echo -n "Entrez votre Agora App Certificate: "
        read -s AGORA_APP_CERTIFICATE
        echo
        echo "$AGORA_APP_CERTIFICATE" | firebase secrets:add AGORA_APP_CERTIFICATE
        log_success "Secrets Agora configurés avec succès"
    fi
    
    echo ""
    read -p "Voulez-vous configurer la clé de chiffrement? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Génération d'une nouvelle clé de chiffrement..."
        ENCRYPTION_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
        
        echo "$ENCRYPTION_MASTER_KEY" | firebase secrets:add ENCRYPTION_MASTER_KEY
        log_success "Clé de chiffrement configurée avec succès"
    fi
fi

# ============================================================================
# Construction des fonctions
# ============================================================================
echo ""
log_info "============================================================================"
log_info "CONSTRUCTION DES FONCTIONS FIREBASE"
log_info "============================================================================"
log_info "Construction des fonctions Firebase..."
cd functions

# Installer les dépendances si nécessaire
if [ ! -d "node_modules" ]; then
    log_info "Installation des dépendances..."
    npm install
fi

# Compiler les fonctions TypeScript
log_info "Compilation TypeScript..."
npm run build

cd ..
log_success "Fonctions construites avec succès"

# ============================================================================
# Déploiement des fonctions
# ============================================================================
echo ""
log_info "============================================================================"
log_info "DÉPLOIEMENT DES FONCTIONS FIREBASE"
log_info "============================================================================"
log_info "Déploiement des fonctions Firebase..."
log_info "Les secrets seront automatiquement déployés avec les fonctions."

# Déployer uniquement les fonctions d'email
firebase deploy --only functions:sendVerificationEmail,functions:sendVerificationEmailHttp

log_success "Déploiement terminé avec succès!"

# ============================================================================
# Vérification du déploiement
# ============================================================================
echo ""
log_info "============================================================================"
log_info "VÉRIFICATION DU DÉPLOIEMENT"
log_info "============================================================================"
log_info "Vérification du déploiement..."

# Lister les fonctions déployées
firebase functions:list

# ============================================================================
# Instructions post-déploiement
# ============================================================================
echo ""
log_success "=========================================="
log_success "Déploiement terminé avec succès!"
log_success "=========================================="
echo ""
log_info "Prochaines étapes:"
echo "  1. Vérifiez vos fonctions déployées dans Firebase Console"
echo "  2. Testez l'envoi d'email depuis l'application"
echo "  3. Surveillez les logs dans Firebase Console"
echo ""
log_warning "IMPORTANT:"
echo "  - Assurez-vous que votre domaine d'envoi est vérifié dans Resend"
echo "  - Configurez SPF/DKIM pour votre domaine dans Resend"
echo "  - Les secrets sont maintenant gérés via Firebase Secret Manager"
echo "  - Ne plus utiliser functions:config pour ces variables"
echo ""
log_info "Pour voir les secrets configurés:"
echo "  firebase secrets:list"
echo ""
log_info "Pour voir les logs en temps réel:"
echo "  firebase functions:log"
echo ""
log_info "Pour tester localement avec l'émulateur:"
echo "  firebase emulators:start"
echo ""
log_info "Pour mettre à jour un secret:"
echo "  echo 'nouvelle_valeur' | firebase secrets:update RESEND_API_KEY"
echo ""
