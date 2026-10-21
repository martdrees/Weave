//@ts-check
/** Français (France) — chaînes d’interface Weave. */
MixAppI18n.register("fr", {
  // App chrome
  "app.name": "Weave",
  "app.subtitle": "Tissez vos playlists pour Spotify",
  "app.shortcuts": "Raccourcis clavier",
  "app.shortcutsHint": "Raccourcis clavier (?)",

  // Toolbar
  "toolbar.unsaved": "Non enregistré",
  "toolbar.seed": "{count} titre de départ",
  "toolbar.seeds": "{count} titres de départ",
  "toolbar.undo": "Annuler",
  "toolbar.redo": "Rétablir",
  "toolbar.addTrack": "Ajouter un titre",
  "toolbar.addTrackTitle": "Rechercher sur Spotify et ajouter un titre",
  "toolbar.recommendations": "Recommandations",
  "toolbar.recommendationsTitle":
    "Recommander des titres à partir des titres de départ / plages de caractéristiques",
  "toolbar.copyFromPlaylist": "Copier depuis une playlist",
  "toolbar.copyFromPlaylistTitle": "Copier des titres depuis une autre playlist",
  "toolbar.flowify": "Flowify",
  "toolbar.flowifyTitle": "Réorganiser automatiquement la playlist (courbes / sets)",
  "toolbar.generator": "Générateur",
  "toolbar.generatorTitle": "Générer une nouvelle playlist à partir de titres de départ",
  "toolbar.stats": "Statistiques",
  "toolbar.statsTitle": "Graphiques des caractéristiques et résumé",
  "toolbar.save": "Enregistrer",
  "toolbar.saving": "Enregistrement…",
  "toolbar.saveTitle": "Remplacer la playlist par l’ordre actuel",
  "toolbar.saveTitleOwnedOnly":
    "Vous ne pouvez remplacer que vos propres playlists",
  "toolbar.saveAsNew": "Enregistrer sous",
  "toolbar.saveAsNewTitle":
    "Créer une nouvelle playlist avec la liste de titres actuelle",

  // Playlist picker
  "picker.playlist": "Playlist",
  "picker.choose": "Choisir une playlist",
  "picker.loading": "Chargement…",
  "picker.select": "Sélectionner une playlist…",
  "picker.empty": "Aucune playlist",
  "picker.refresh": "Actualiser",
  "picker.refreshTitle": "Actualiser la liste des playlists",
  "picker.tracks": "{count} titres",

  // Arranger
  "arranger.loading": "Récupération du contenu de la playlist depuis Spotify.",
  "arranger.empty":
    "Sélectionnez une playlist pour modifier l’ordre de ses titres.",
  "arranger.emptyHint": "Appuyez sur ? pour afficher les raccourcis clavier.",
  "arranger.aria": "Titres de la playlist",
  "arranger.columnsMenu": "Clic droit pour afficher ou masquer des colonnes",
  "arranger.sortBy": "Trier par {label}",
  "arranger.drag": "Faire glisser pour réorganiser",
  "arranger.moveUp": "Monter",
  "arranger.moveDown": "Descendre",
  "arranger.remove": "Retirer de la playlist",
  "arranger.seedMark": "Marquer comme titre de départ",
  "arranger.seedUnmark": "Retirer des titres de départ",
  "arranger.rowSeed":
    "Titre de départ — cliquer pour le retirer · faire glisser ⋮⋮ pour réorganiser",
  "arranger.rowNormal":
    "Cliquer pour marquer comme titre de départ · faire glisser ⋮⋮ pour réorganiser",
  "arranger.play": "Lire {name}",
  "arranger.pause": "Mettre {name} en pause",
  "arranger.trackFallback": "titre",
  "common.unknown": "Inconnu",
  "common.close": "Fermer",
  "common.dialog": "Boîte de dialogue",
  "common.reset": "Réinitialiser",
  "common.cancel": "Annuler",
  "common.search": "Rechercher",
  "common.apply": "Appliquer",

  // Columns / features (short table headers)
  "col.index": "#",
  "col.track": "Titre",
  "col.bpm": "BPM",
  "col.key": "Tonalité",
  "col.energy": "Énergie",
  "col.dance": "Danse",
  "col.valence": "Valence",
  "col.acoustic": "Acoust.",
  "col.instr": "Instr.",
  "col.speech": "Parole",
  "col.live": "Live",
  "col.loud": "Volume",
  "col.time": "Temps",
  "col.added": "Ajouté",
  "col.duration": "Durée",
  "col.album": "Album",

  "feature.acousticness": "Caractère acoustique",
  "feature.danceability": "Dansabilité",
  "feature.energy": "Énergie",
  "feature.instrumentalness": "Caractère instrumental",
  "feature.liveness": "Présence live",
  "feature.speechiness": "Présence de voix parlée",
  "feature.valence": "Valence",
  "feature.tempo": "Tempo (BPM)",
  "feature.loudness": "Volume (dB)",
  "feature.popularity": "Popularité",

  // Recommendations / search panel
  "search.title": "Recommandations",
  "search.fitToSeeds": "Ajuster aux titres de départ",
  "search.fitting": "Ajustement…",
  "search.fitTitle":
    "Définir min/max à partir des caractéristiques audio des titres de départ sélectionnés",
  "search.resetRanges": "Réinitialiser les plages",
  "search.maxResults": "Nombre max. de résultats",
  "search.search": "Rechercher",
  "search.seedsNeeded":
    "Chargez une playlist ou marquez des titres de départ",
  "search.featureRanges": "Plages de caractéristiques",
  "search.mixInKey": "Mixage en tonalité",
  "search.filters": "Filtres",
  "search.hideInPlaylist": "Masquer ceux déjà dans la playlist",
  "search.hideArtists": "Masquer les artistes",
  "search.noExplicit": "Sans contenu explicite",
  "search.noAberrant": "Sans titres aberrants",
  "search.yearFrom": "De",
  "search.yearTo": "À",
  "search.year": "Année",
  "search.avg": "Moy.",
  "search.avgTitle":
    "Utiliser la valeur cible : définir min/max autour de la moyenne",
  "search.avgUnavailable":
    "Moyenne indisponible (titres de départ ou caractéristiques de la playlist requis)",
  "search.minMax": "Min – max",
  "search.minMaxAvg": "Min – max (moy. {avg})",
  "search.average": "Moyenne : {value}",
  "camelot.harmonic": "Harmonique",
  "camelot.harmonicHint": "Rester dans la même tonalité (exacte)",
  "camelot.moreEnergy": "Plus d’énergie",
  "camelot.moreEnergyHint": "Nombre +1 · plus d’énergie",
  "camelot.lessEnergy": "Moins d’énergie",
  "camelot.lessEnergyHint": "Nombre −1 · moins d’énergie",
  "camelot.brighter": "Ambiance plus lumineuse",
  "camelot.brighterHint": "Lettre → B · mineur → majeur",
  "camelot.darker": "Ambiance plus sombre",
  "camelot.darkerHint": "Lettre → A · majeur → mineur",
  "camelot.boost": "Boost d’énergie",
  "camelot.boostHint": "Saut de +2 · boost d’énergie",
  "camelot.moodShift": "Changement d’ambiance",
  "camelot.moodShiftHint": "Diagonale (±1 + changement de lettre)",
  "camelot.harmonicShift": "Saut harmonique",
  "camelot.harmonicShiftHint":
    "Jaws (±5) · chute / saut harmonique spectaculaire",

  // Search results
  "results.title": "Résultats",
  "results.add": "Ajouter",
  "results.addSelected": "Ajouter la sélection",
  "results.empty": "Aucun résultat",
  "results.meta": "{count} titres",

  // Modals
  "addTrack.title": "Ajouter un titre",
  "addTrack.placeholder": "Rechercher des titres…",
  "addTrack.search": "Rechercher",
  "copy.title": "Copier depuis une playlist",
  "copy.placeholder": "Rechercher des playlists…",
  "copy.import": "Importer la sélection",
  "copy.noSelection": "Aucun nouveau titre sélectionné",
  "copy.allExist": "Tous les titres sont déjà dans votre playlist",

  "flowify.title": "Flowify",
  "flowify.blurb":
    "Réorganise automatiquement la playlist actuelle. « Annuler » rétablit l’ordre précédent.",
  "flowify.sets": "Sets",
  "flowify.curves": "Courbes",
  "flowify.setSize": "Taille des sets",
  "flowify.curveShape": "Forme de la courbe",
  "flowify.weights": "Pondération des caractéristiques",
  "flowify.invert": "Inverser la courbe de cette caractéristique",
  "flowify.inv": "Inv.",
  "flowify.apply": "Appliquer l’arrangement",
  "flowify.working": "Traitement…",
  "flowify.needPlaylist": "Chargez d’abord une playlist contenant des titres",
  "flowify.needWeight":
    "Définissez au moins une pondération de caractéristique supérieure à 0",
  "flowify.doneCurves": "Playlist réorganisée (courbes)",
  "flowify.doneSets": "Playlist réorganisée (sets)",
  "flowify.failed": "Échec de Flowify",

  "generator.title": "Générateur",
  "generator.name": "Nom de la playlist",
  "generator.size": "Nombre de titres",
  "generator.excludeExplicit": "Exclure le contenu explicite",
  "generator.excludeAberrant": "Exclure les titres aberrants",
  "generator.flowifyAfter": "Appliquer Flowify après la génération",
  "generator.generate": "Générer",
  "generator.generating": "Génération…",
  "generator.create": "Créer la playlist",
  "generator.creating": "Création…",
  "generator.preview": "Aperçu",
  "generator.defaultName": "Générée par Weave",

  "stats.title": "Statistiques",
  "stats.legendRaw": "Brut",
  "stats.legendMa": "Moy. sur 5 titres",
  "stats.noData": "aucune donnée",
  "stats.empty": "Aucune donnée de caractéristiques enrichie pour le moment.",
  "stats.pickMetric": "Sélectionnez une mesure ci-dessus.",
  "stats.needTwo":
    "Au moins deux titres enrichis sont nécessaires pour calculer la variation entre titres.",
  "stats.noValues":
    "Aucune valeur de caractéristique pour ces titres pour le moment.",
  "stats.avg": "moy. {value}",

  // Shortcuts help
  "shortcuts.title": "Raccourcis clavier",
  "shortcuts.note":
    "Les raccourcis sont ignorés pendant la saisie dans un champ (sauf Enregistrer).",
  "shortcuts.undo": "Annuler",
  "shortcuts.redo": "Rétablir",
  "shortcuts.save": "Enregistrer la playlist",
  "shortcuts.saveAsNew": "Enregistrer sous",
  "shortcuts.toggleRecs": "Afficher / masquer les recommandations",
  "shortcuts.addTrack": "Ajouter un titre",
  "shortcuts.copy": "Copier depuis une playlist",
  "shortcuts.flowify": "Flowify",
  "shortcuts.generator": "Générateur",
  "shortcuts.toggleStats": "Afficher / masquer les statistiques",
  "shortcuts.selectTrack":
    "Sélectionner un titre dans la liste (cliquez d’abord sur la liste)",
  "shortcuts.moveTrack": "Déplacer le titre sélectionné",
  "shortcuts.firstLast": "Premier / dernier titre",
  "shortcuts.removeTrack": "Retirer le titre sélectionné",
  "shortcuts.showHelp": "Afficher cette aide",
  "shortcuts.close": "Fermer le panneau / la fenêtre au premier plan",

  // Notifications / errors
  "notify.failedPlaylists": "Impossible de charger les playlists",
  "notify.playlistUnavailable":
    "Cette playlist n’est plus disponible (supprimée ou passée en privé)",
  "notify.rateLimit":
    "Limite de requêtes Spotify atteinte — patientez un instant puis réessayez",
  "notify.rateLimitBackoff":
    "Limite de requêtes Spotify atteinte — nouvelle tentative dans {seconds} s…",
  "notify.failedPlaylist": "Impossible de charger la playlist",
  "notify.cannotSaveLoading":
    "Impossible d’enregistrer pendant le chargement de la playlist",
  "notify.playlistChangedCancel":
    "La playlist a été modifiée — enregistrement annulé",
  "notify.playlistChangedDuringSave":
    "La playlist a été modifiée pendant l’enregistrement — état local inchangé",
  "notify.playlistSaved": "Playlist enregistrée",
  "notify.saveFailed": "Échec de l’enregistrement",
  "notify.created": "« {name} » créée",
  "notify.createFailed": "Échec de la création",
  "notify.alreadyInPlaylist": "Titre déjà présent dans la playlist",
  "notify.addedTrack": "« {name} » ajouté",
  "notify.noNewTracks": "Aucun nouveau titre à ajouter",
  "notify.addedCount": "{count} titres ajoutés",
  "notify.selectSeeds": "Sélectionnez d’abord des titres de départ",
  "notify.noSeedFeatures":
    "Aucune caractéristique audio pour ces titres de départ",
  "notify.fittedSeeds": "Plages de caractéristiques ajustées aux titres de départ",
  "notify.needSeedsOrPlaylist":
    "Chargez d’abord une playlist ou marquez des titres de départ",
  "notify.noMatches":
    "Aucune correspondance avec les filtres — essayez de désactiver des filtres ou des plages",
  "notify.searchFailed": "Échec de la requête de recherche",
  "notify.fitFailed": "Impossible d’ajuster les caractéristiques",
  "notify.playbackFailed": "Impossible de lancer la lecture",
  "notify.generatorCreated": "« {name} » créée ({count} titres)",
  "notify.fillPlaylistFailed":
    "Playlist créée, mais tous les titres n’ont pas pu être ajoutés",

  "playlist.defaultName": "Playlist Weave",
  "playlist.weaveSuffix": "{name} (Weave)",

  // Extra UI keys
  "common.emptyQuery": "Saisissez une recherche",
  "common.emptyPlaylistQuery": "Saisissez un nom de playlist",
  "copy.library": "Votre bibliothèque",
  "copy.selectNew": "Sélectionner les nouveaux",
  "copy.clear": "Effacer",
  "copy.addAllNew": "Ajouter tous les nouveaux",
  "copy.inPlaylist": "Dans la playlist",
  "arranger.columns": "Colonnes",
  "generator.needGenerate": "Générez d’abord des titres",
  "generator.pressGenerate": "Appuyez sur Générer pour prévisualiser…",
  "generator.noSeeds": "Aucun titre de départ — playlist utilisée en soft seed",
});
