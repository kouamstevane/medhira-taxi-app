# Registre d’icônes partagé — conception

## Objectif

Éliminer les icônes en forme de point d’interrogation dans toute l’application. Le composant partagé `MaterialIcon` utilise désormais des SVG Lucide, mais son registre ne couvre pas tous les noms d’icônes encore utilisés par les pages et composants.

## Conception

- Compléter le registre `iconMap` de `src/components/ui/MaterialIcon.tsx` avec les équivalents Lucide des noms utilisés dans l’application.
- Conserver l’API actuelle (`name`, `size`, `className`, `filled`) afin de corriger les consommateurs existants sans modifier chaque page.
- Conserver un fallback visuel pour les noms réellement inconnus, tout en ajoutant une couverture de test pour les noms d’icônes actuellement utilisés.
- Utiliser exclusivement les composants SVG importés depuis `lucide-react`; aucune dépendance à une police d’icônes distante ne sera ajoutée.

## Correspondance et comportement

Les noms Material existants resteront l’interface stable. Chaque nom recevra une icône Lucide correspondant à son intention visuelle : navigation, transport, repas, colis, compte, paiement, état ou action. La propriété `filled` continuera à remplir les SVG avec `currentColor`.

## Vérification

- Ajouter ou étendre les tests unitaires de `MaterialIcon` afin de vérifier que les noms utilisés rendent un SVG concret et ne sont pas réduits au fallback `CircleHelp`.
- Exécuter le test ciblé, le lint et le typecheck.
- Vérifier visuellement `/dashboard/` dans le navigateur et contrôler les erreurs de console.

## Hors périmètre

Cette correction ne modifie pas les routes, le contenu métier, le style général des cartes ni les icônes d’images utilisées par Google Maps.
