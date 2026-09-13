export const notifications = {
  title: 'Notifications',
  noNotifications: 'Aucune notification',
  noNotificationsDesc: 'Vous n’avez pas de nouvelles notifications pour le moment.',
  markAllAsRead: 'Tout marquer comme lu',
  clearAll: 'Effacer tout',
  back: 'Retour',
  networkErrorTitle: 'Oops !',
  networkErrorMessage: 'Impossible de charger vos notifications. Veuillez vérifier votre connexion internet et réessayer.',

  // System driver notifications
  sysPendingTitle: 'Candidature en cours d’examen',
  sysPendingBody: 'Vos données sont en lecture seule jusqu’à approbation par notre équipe.',
  sysEmailVerifiedTitle: 'Adresse email validée',
  sysEmailVerifiedBody: 'Votre adresse email est validée. Votre candidature est en cours d’étude par notre équipe. Vous recevrez une confirmation dès que votre compte sera approuvé.',
  sysStripeDisabledTitle: 'Compte de paiement désactivé',
  sysStripeDisabledBody: 'Contactez le support pour réactiver vos virements.',
  sysStripeRestrictedTitle: 'Compte de paiement restreint',
  sysStripeRestrictedBody: '{count} information(s) à fournir pour débloquer vos virements.',
  sysStripeRestrictedFallback: 'Vos virements sont bloqués. Vérifiez votre compte Stripe.',
  sysStripeNotCreatedTitle: 'Configuration des paiements requise',
  sysStripeNotCreatedBody: 'Vous ne pourrez pas être payé tant que votre compte Stripe n’est pas configuré.',
  sysStripePendingTitle: 'Configuration des paiements à terminer',
  sysStripePendingBody: '{count} information(s) demandée(s) par Stripe.',
  sysStripePendingFallback: 'Vérification Stripe en cours.',
  sysAvailableTitle: 'Disponible — En attente',
  sysAvailableBody: 'Votre position est visible par les clients. Restez à proximité des zones animées.',

  // Taxi
  driverAssignedTitle: 'Chauffeur trouvé !',
  driverAssignedBody: '{{driver}} est en route dans une {{vehicle}}.',
  driverArrivedTitle: 'Votre chauffeur est arrivé !',
  driverArrivedBody: '{{driver}} vous attend au point de départ.',
  tripStartedTitle: 'Course démarrée',
  tripStartedBody: 'Bonne route vers {{destination}} !',
  tripCompletedTitle: 'Course terminée',
  tripCompletedBody: 'Merci d’avoir choisi Medjira. N’oubliez pas de noter votre chauffeur.',

  // Food
  foodPreparingTitle: 'Commande en préparation',
  foodPreparingBody: 'Le restaurant prépare vos plats.',
  foodCourierHeadingTitle: 'Livreur en route',
  foodCourierHeadingBody: 'Votre livreur arrive avec votre commande.',
  foodDeliveredTitle: 'Commande livrée !',
  foodDeliveredBody: 'Bon appétit !',

  // Parcel
  parcelPickedUpTitle: 'Colis pris en charge',
  parcelPickedUpBody: 'Le coursier a récupéré votre colis.',
  parcelDeliveredTitle: 'Colis livré',
  parcelDeliveredBody: 'Votre colis a été remis au destinataire.',

  // Wallet
  walletCreditedTitle: 'Rechargement réussi',
  walletCreditedBody: 'Votre portefeuille a été crédité de {{amount}}.',
  payoutProcessedTitle: 'Virement effectué',
  payoutProcessedBody: 'Un virement de {{amount}} a été envoyé sur votre compte bancaire.',
};
