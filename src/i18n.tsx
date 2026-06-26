import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

// Lightweight in-house i18n (no dependency, offline-first). The chosen language
// is persisted to localStorage so it sticks until switched. Strings live in a
// single flat dictionary keyed by dotted ids; t() falls back to English, then
// to the key itself, so a missing translation never blanks the UI.

export type Lang = 'en' | 'fr'
const STORAGE_KEY = 'tl.lang'

type Dict = Record<string, string>

const EN: Dict = {
  'lang.toggle': 'FR',
  // header
  'app.sub': 'Field Casualty Record',
  'hdr.case': 'CASE',
  'hdr.new': '+ New casualty',
  'hdr.board': '🚩 Board',
  'hdr.summary': '🖨 Summary',
  'hdr.tour': '❔ Tour',
  'hdr.ehr': 'Send to EHR ↑',
  'hdr.fhir': 'Export FHIR ↓',
  'hdr.more': '⋯ More',
  // triage
  'triage.label': 'Triage',
  'triage.notset': 'Not set — tap a level',
  'triage.immediate': 'Immediate (Red)',
  'triage.delayed': 'Delayed (Yellow)',
  'triage.minor': 'Minor (Green)',
  'triage.deceased': 'Deceased (Black)',
  // tour offer
  'tour.offer': '👋 New here? Take a 60-second guided tour with voice-over.',
  'tour.start': 'Start tour',
  // guided tour (voice-over steps + controls)
  'tour.skip': 'Skip', 'tour.back': 'Back', 'tour.next': 'Next', 'tour.done': 'Done',
  'tour.mute': 'Mute voice-over', 'tour.unmute': 'Unmute voice-over', 'tour.toggle': 'Toggle voice-over',
  'tour.welcome.title': 'Welcome',
  'tour.welcome.say': "Welcome to Triage-Link. I'll walk you through documenting a casualty. Follow along on the screen, or tap Next.",
  'tour.palette.title': 'Pick an injury type',
  'tour.palette.say': 'Start by choosing an injury type from this palette — for example, Laceration or Burn.',
  'tour.charts.title': 'Mark it on the body',
  'tour.charts.say': 'Tap a body region to zoom in, then tap again to drop a marker right where the injury is.',
  'tour.editor.title': 'Add the detail',
  'tour.editor.say': 'For the selected injury, set its severity, add notes, and attach a wound photo with the camera.',
  'tour.triage.title': 'Set triage',
  'tour.triage.say': "Set the patient's triage level. It shows on the casualty card and on the triage board.",
  'tour.vitals.title': 'Record vitals',
  'tour.vitals.say': 'Record a timestamped set of vitals here. Add a fresh set at each reassessment.',
  'tour.summary.title': 'Hand over',
  'tour.summary.say': 'When you hand over, open Summary to print or save a one-page casualty card as a PDF.',
  'tour.board.title': 'See the whole scene',
  'tour.board.say': 'With several casualties, the Board groups everyone by triage — the scene picture for command.',
  'tour.done.title': "You're set",
  'tour.done.say': "That's the core flow. Everything saves offline on this device. You can replay this tour anytime from the help button.",
  // tombstone
  'tomb.title': 'Tombstone — identity',
  'tomb.name': 'Full name',
  'tomb.name_ph': 'Surname, Given',
  'tomb.dob': 'Date of birth',
  'tomb.sex': 'Sex',
  'sex.female': 'Female',
  'sex.male': 'Male',
  'sex.other': 'Other',
  'sex.unknown': 'Unknown',
  'tomb.mrn': 'Patient ID / MRN',
  'tomb.blood': 'Blood type',
  'tomb.blood_ph': 'Unknown',
  'tomb.nok': 'Next of kin',
  'tomb.nokphone': 'NOK phone',
  // incident
  'inc.title': 'Incident',
  'inc.time': 'Time of injury',
  'inc.mech': 'Mechanism',
  'inc.mech_ph': 'Blunt, RTC, GSW…',
  'inc.loc': 'Location of incident',
  'inc.loc_ph': 'Address / grid / GPS',
  'inc.ageband': 'Age band',
  'inc.ageband_note': '· adjusts burn TBSA (Lund–Browder)',
  'inc.fromdob': '· {n}y from DOB',
  'age.infant': '<1y',
  'age.age1': '1y',
  'age.age5': '5y',
  'age.age10': '10y',
  'age.age15': '15y',
  'age.adult': 'Adult',
  // injury chart
  'chart.title': 'Injury chart — anterior / posterior',
  'chart.hint': 'Pick an injury type · tap a body area to blow it up · tap again to drop a marker. Tap a marker to edit it below.',
  'chart.tip': 'After dropping a marker, tap it to set severity, add notes, and 📷 attach wound photos. When zoomed in, use ← Full body to zoom back out.',
  'bc.anterior': 'Anterior · front', 'bc.posterior': 'Posterior · back', 'bc.fullbody': '← Full body', 'bc.patient': 'Patient',
  'injury.fracture': 'Fracture',
  'injury.laceration': 'Laceration',
  'injury.burn': 'Burn',
  'injury.gsw': 'Gunshot',
  'injury.contusion': 'Contusion',
  'injury.amputation': 'Amputation',
  'injury.abrasion': 'Abrasion',
  'injury.puncture': 'Puncture',
  // logged injuries
  'inj.title': 'Logged injuries',
  'inj.empty': 'No injuries marked yet.',
  'inj.notes_ph': 'Notes — size, depth, contamination…',
  'inj.addphoto': '📷 Add photo',
  'inj.photohint': 'Photograph the wound — saved with this injury',
  'inj.photoerr': 'Couldn’t capture a photo — allow camera access in your browser/app settings.',
  'inj.selecthint': 'Tap an injury marker (or a row above) to edit it or attach a 📷 photo.',
  'sev.minor': 'minor',
  'sev.moderate': 'moderate',
  'sev.severe': 'severe',
  'sev.critical': 'critical',
  'tbsa': 'TBSA',
  // acuity glance
  'glance.title': 'Acuity at a glance',
  'glance.notriage': 'Triage not set',
  'glance.vitals': 'Latest vitals',
  'glance.novitals': 'None recorded yet',
  'glance.injuries_one': '{n} injury',
  'glance.injuries_many': '{n} injuries',
  // vitals
  'vit.title': 'Vitals',
  'vit.hr': 'HR', 'vit.bp': 'BP', 'vit.rr': 'RR', 'vit.spo2': 'SpO₂', 'vit.gcs': 'GCS', 'vit.pain': 'Pain',
  'vit.hr_name': 'Heart rate', 'vit.bp_name': 'Blood pressure', 'vit.rr_name': 'Respiratory rate',
  'vit.spo2_name': 'Oxygen saturation', 'vit.gcs_name': 'Glasgow Coma Scale', 'vit.pain_name': 'Pain score',
  'vit.gcscalc': 'GCS calculator',
  'gcs.eye': 'Eye (E)', 'gcs.verbal': 'Verbal (V)', 'gcs.motor': 'Motor (M)',
  'gcsopt.Spontaneous': 'Spontaneous', 'gcsopt.To speech': 'To speech', 'gcsopt.To pain': 'To pain', 'gcsopt.None': 'None',
  'gcsopt.Oriented': 'Oriented', 'gcsopt.Confused': 'Confused', 'gcsopt.Inappropriate words': 'Inappropriate words',
  'gcsopt.Incomprehensible sounds': 'Incomprehensible sounds', 'gcsopt.Obeys commands': 'Obeys commands',
  'gcsopt.Localises pain': 'Localises pain', 'gcsopt.Withdraws from pain': 'Withdraws from pain',
  'gcsopt.Abnormal flexion': 'Abnormal flexion', 'gcsopt.Abnormal extension': 'Abnormal extension',
  'vit.record': 'Record vitals',
  'vit.hint': 'Enter any fields and tap Record — log a fresh timestamped set at each reassessment.',
  // treatment
  'tx.title': 'Treatment log',
  'tx.intervention': 'Intervention',
  'tx.detail': 'Detail (dose / route / site)',
  'tx.detail_ph': 'e.g. Morphine 10mg IM',
  'tx.location': 'Location',
  'tx.place.scene': 'At scene', 'tx.place.enroute': 'En route', 'tx.place.handover': 'At handover',
  'tx.provider': 'Provider',
  'tx.provider_ph': 'Initials / unit',
  'tx.log': 'Log intervention',
  'tx.hint': 'Logged interventions appear here with time, place, and provider.',
  'txt.Tourniquet': 'Tourniquet', 'txt.Hemostatic dressing': 'Hemostatic dressing', 'txt.Pressure dressing': 'Pressure dressing',
  'txt.Airway (NPA/OPA)': 'Airway (NPA/OPA)', 'txt.Needle decompression': 'Needle decompression',
  'txt.IV access / fluids': 'IV access / fluids', 'txt.Medication': 'Medication', 'txt.Splint / immobilisation': 'Splint / immobilisation',
  'txt.Wound packing': 'Wound packing', 'txt.Burn cooling': 'Burn cooling', 'txt.CPR': 'CPR', 'txt.Other': 'Other',
  // saved
  'saved.title': 'Saved casualties',
  'saved.backup': '⬇ Backup',
  'saved.restore': '⬆ Restore',
  'saved.empty': 'Records auto-save as you type.',
  'saved.tip': '🚩 Board (top bar) shows every casualty grouped by triage · 🖨 Summary prints a one-page handover card.',
  'saved.unidentified': 'Unidentified',
  'saved.handedover': ' · handed over',
  'saved.inj': 'inj',
  'imp.q': 'Import {n} records?',
  'imp.merge': 'Merge',
  'imp.replace': 'Replace all',
  'footnote': 'Prototype — not a medical device, not for clinical use. Data is stored locally on this device only.',
  // date of birth
  'dob.ph': 'YYYY-MM-DD',
  // casualty card
  'sm.card': '◇ TRIAGE-LINK — Casualty Card',
  'sm.atmist': 'AT-MIST handover',
  'sm.a': 'Age / sex', 'sm.t': 'Time of incident', 'sm.m': 'Mechanism',
  'sm.i': 'Injuries', 'sm.s': 'Signs', 'sm.tx': 'Treatment',
  'sm.patient': 'Patient', 'sm.name': 'Name', 'sm.dob': 'DOB', 'sm.sex': 'Sex', 'sm.ageband': 'Age band',
  'sm.mrn': 'MRN', 'sm.blood': 'Blood type', 'sm.nok': 'Next of kin', 'sm.nokphone': 'NOK phone', 'sm.address': 'Address',
  'sm.incident': 'Incident', 'sm.timeofinjury': 'Time of injury', 'sm.location': 'Location',
  'sm.injuries': 'Injuries', 'sm.none': 'None recorded.',
  'sm.region': 'Region', 'sm.view': 'View', 'sm.type': 'Type', 'sm.severity': 'Severity', 'sm.notes': 'Notes',
  'sm.burntbsa': 'Burn TBSA', 'sm.time': 'Time', 'sm.vitals': 'Vitals', 'sm.treatments': 'Treatments',
  'sm.intervention': 'Intervention', 'sm.detail': 'Detail', 'sm.place': 'Place', 'sm.provider': 'Provider',
  'sm.handover': 'Handover', 'sm.clinician': 'Clinician', 'sm.facility': 'Facility', 'sm.nothandedover': 'Not yet handed over.',
  'sm.print': '🖨 Print / Save PDF', 'sm.close': 'Close', 'sm.generated': 'Generated',
  'view.anterior': 'anterior', 'view.posterior': 'posterior',
}

const FR: Dict = {
  'lang.toggle': 'EN',
  'app.sub': 'Fiche de blessé sur le terrain',
  'hdr.case': 'CAS',
  'hdr.new': '+ Nouveau blessé',
  'hdr.board': '🚩 Tableau',
  'hdr.summary': '🖨 Résumé',
  'hdr.tour': '❔ Visite',
  'hdr.ehr': 'Envoyer au DSE ↑',
  'hdr.fhir': 'Exporter FHIR ↓',
  'hdr.more': '⋯ Plus',
  'triage.label': 'Triage',
  'triage.notset': 'Non défini — touchez un niveau',
  'triage.immediate': 'Immédiat (Rouge)',
  'triage.delayed': 'Différé (Jaune)',
  'triage.minor': 'Mineur (Vert)',
  'triage.deceased': 'Décédé (Noir)',
  'tour.offer': '👋 Nouveau ? Faites une visite guidée de 60 secondes avec narration.',
  'tour.start': 'Démarrer la visite',
  'tour.skip': 'Passer', 'tour.back': 'Retour', 'tour.next': 'Suivant', 'tour.done': 'Terminé',
  'tour.mute': 'Couper la narration', 'tour.unmute': 'Activer la narration', 'tour.toggle': 'Activer/couper la narration',
  'tour.welcome.title': 'Bienvenue',
  'tour.welcome.say': 'Bienvenue dans Triage-Link. Je vais vous guider pour documenter un blessé. Suivez à l’écran ou touchez Suivant.',
  'tour.palette.title': 'Choisir un type de blessure',
  'tour.palette.say': 'Commencez par choisir un type de blessure dans cette palette — par exemple Lacération ou Brûlure.',
  'tour.charts.title': 'Marquer sur le corps',
  'tour.charts.say': 'Touchez une zone du corps pour zoomer, puis touchez à nouveau pour poser un repère à l’endroit exact de la blessure.',
  'tour.editor.title': 'Ajouter le détail',
  'tour.editor.say': 'Pour la blessure sélectionnée, définissez sa gravité, ajoutez des notes et joignez une photo de la plaie avec la caméra.',
  'tour.triage.title': 'Définir le triage',
  'tour.triage.say': 'Définissez le niveau de triage du patient. Il apparaît sur la fiche de blessé et sur le tableau de triage.',
  'tour.vitals.title': 'Enregistrer les signes vitaux',
  'tour.vitals.say': 'Enregistrez ici un jeu de signes vitaux horodaté. Ajoutez-en un nouveau à chaque réévaluation.',
  'tour.summary.title': 'Transmettre',
  'tour.summary.say': 'Au moment de la transmission, ouvrez Résumé pour imprimer ou enregistrer une fiche de blessé d’une page en PDF.',
  'tour.board.title': 'Voir toute la scène',
  'tour.board.say': 'Avec plusieurs blessés, le Tableau regroupe tout le monde par triage — la vue de la scène pour le commandement.',
  'tour.done.title': 'Vous êtes prêt',
  'tour.done.say': 'Voilà le déroulement principal. Tout est enregistré hors ligne sur cet appareil. Vous pouvez rejouer cette visite à tout moment depuis le bouton d’aide.',
  'tomb.title': 'État civil — identité',
  'tomb.name': 'Nom complet',
  'tomb.name_ph': 'Nom, Prénom',
  'tomb.dob': 'Date de naissance',
  'tomb.sex': 'Sexe',
  'sex.female': 'Femme',
  'sex.male': 'Homme',
  'sex.other': 'Autre',
  'sex.unknown': 'Inconnu',
  'tomb.mrn': 'ID patient / NDA',
  'tomb.blood': 'Groupe sanguin',
  'tomb.blood_ph': 'Inconnu',
  'tomb.nok': 'Proche à prévenir',
  'tomb.nokphone': 'Tél. du proche',
  'inc.title': 'Incident',
  'inc.time': 'Heure de la blessure',
  'inc.mech': 'Mécanisme',
  'inc.mech_ph': 'Contondant, AVP, arme à feu…',
  'inc.loc': 'Lieu de l’incident',
  'inc.loc_ph': 'Adresse / coord. / GPS',
  'inc.ageband': 'Tranche d’âge',
  'inc.ageband_note': '· ajuste la SCB brûlée (Lund–Browder)',
  'inc.fromdob': '· {n} ans selon DDN',
  'age.infant': '<1 an',
  'age.age1': '1 an',
  'age.age5': '5 ans',
  'age.age10': '10 ans',
  'age.age15': '15 ans',
  'age.adult': 'Adulte',
  'chart.title': 'Schéma des blessures — face / dos',
  'chart.hint': 'Choisissez un type de blessure · touchez une zone du corps pour l’agrandir · touchez à nouveau pour poser un repère. Touchez un repère pour le modifier ci-dessous.',
  'chart.tip': 'Après avoir posé un repère, touchez-le pour définir la gravité, ajouter des notes et 📷 joindre des photos de plaie. En zoom, utilisez ← Corps entier pour dézoomer.',
  'bc.anterior': 'Face · avant', 'bc.posterior': 'Dos · arrière', 'bc.fullbody': '← Corps entier', 'bc.patient': 'Patient',
  'injury.fracture': 'Fracture',
  'injury.laceration': 'Lacération',
  'injury.burn': 'Brûlure',
  'injury.gsw': 'Arme à feu',
  'injury.contusion': 'Contusion',
  'injury.amputation': 'Amputation',
  'injury.abrasion': 'Abrasion',
  'injury.puncture': 'Perforation',
  'inj.title': 'Blessures enregistrées',
  'inj.empty': 'Aucune blessure marquée.',
  'inj.notes_ph': 'Notes — taille, profondeur, contamination…',
  'inj.addphoto': '📷 Ajouter une photo',
  'inj.photohint': 'Photographiez la plaie — enregistrée avec cette blessure',
  'inj.photoerr': 'Impossible de prendre une photo — autorisez l’accès à la caméra dans les réglages.',
  'inj.selecthint': 'Touchez un repère de blessure (ou une ligne ci-dessus) pour le modifier ou joindre une 📷 photo.',
  'sev.minor': 'mineure',
  'sev.moderate': 'modérée',
  'sev.severe': 'sévère',
  'sev.critical': 'critique',
  'tbsa': 'SCB',
  'glance.title': 'Gravité en un coup d’œil',
  'glance.notriage': 'Triage non défini',
  'glance.vitals': 'Derniers signes vitaux',
  'glance.novitals': 'Aucun enregistré',
  'glance.injuries_one': '{n} blessure',
  'glance.injuries_many': '{n} blessures',
  'vit.title': 'Signes vitaux',
  'vit.hr': 'FC', 'vit.bp': 'TA', 'vit.rr': 'FR', 'vit.spo2': 'SpO₂', 'vit.gcs': 'GCS', 'vit.pain': 'Douleur',
  'vit.hr_name': 'Fréquence cardiaque', 'vit.bp_name': 'Tension artérielle', 'vit.rr_name': 'Fréquence respiratoire',
  'vit.spo2_name': 'Saturation en oxygène', 'vit.gcs_name': 'Échelle de Glasgow', 'vit.pain_name': 'Score de douleur',
  'vit.gcscalc': 'Calculateur GCS',
  'gcs.eye': 'Yeux (Y)', 'gcs.verbal': 'Verbal (V)', 'gcs.motor': 'Moteur (M)',
  'gcsopt.Spontaneous': 'Spontanée', 'gcsopt.To speech': 'À la voix', 'gcsopt.To pain': 'À la douleur', 'gcsopt.None': 'Aucune',
  'gcsopt.Oriented': 'Orientée', 'gcsopt.Confused': 'Confuse', 'gcsopt.Inappropriate words': 'Mots inappropriés',
  'gcsopt.Incomprehensible sounds': 'Sons incompréhensibles', 'gcsopt.Obeys commands': 'Obéit aux ordres',
  'gcsopt.Localises pain': 'Localise la douleur', 'gcsopt.Withdraws from pain': 'Retrait à la douleur',
  'gcsopt.Abnormal flexion': 'Flexion anormale', 'gcsopt.Abnormal extension': 'Extension anormale',
  'vit.record': 'Enregistrer les signes',
  'vit.hint': 'Remplissez les champs voulus et touchez Enregistrer — consignez un jeu horodaté à chaque réévaluation.',
  'tx.title': 'Journal des soins',
  'tx.intervention': 'Intervention',
  'tx.detail': 'Détail (dose / voie / site)',
  'tx.detail_ph': 'p. ex. Morphine 10 mg IM',
  'tx.location': 'Lieu',
  'tx.place.scene': 'Sur les lieux', 'tx.place.enroute': 'En transport', 'tx.place.handover': 'À la remise',
  'tx.provider': 'Intervenant',
  'tx.provider_ph': 'Initiales / unité',
  'tx.log': 'Consigner l’intervention',
  'tx.hint': 'Les interventions consignées apparaissent ici avec l’heure, le lieu et l’intervenant.',
  'txt.Tourniquet': 'Garrot', 'txt.Hemostatic dressing': 'Pansement hémostatique', 'txt.Pressure dressing': 'Pansement compressif',
  'txt.Airway (NPA/OPA)': 'Voies aériennes (canule)', 'txt.Needle decompression': 'Décompression à l’aiguille',
  'txt.IV access / fluids': 'Voie IV / solutés', 'txt.Medication': 'Médicament', 'txt.Splint / immobilisation': 'Attelle / immobilisation',
  'txt.Wound packing': 'Méchage de plaie', 'txt.Burn cooling': 'Refroidissement de brûlure', 'txt.CPR': 'RCP', 'txt.Other': 'Autre',
  'saved.title': 'Blessés enregistrés',
  'saved.backup': '⬇ Sauvegarde',
  'saved.restore': '⬆ Restaurer',
  'saved.empty': 'Les fiches sont enregistrées automatiquement.',
  'saved.tip': '🚩 Le Tableau (barre du haut) regroupe les blessés par triage · 🖨 Le Résumé imprime une fiche de remise d’une page.',
  'saved.unidentified': 'Non identifié',
  'saved.handedover': ' · remis',
  'saved.inj': 'bl.',
  'imp.q': 'Importer {n} fiches ?',
  'imp.merge': 'Fusionner',
  'imp.replace': 'Tout remplacer',
  'footnote': 'Prototype — dispositif non médical, usage clinique interdit. Les données sont stockées localement sur cet appareil uniquement.',
  'dob.ph': 'AAAA-MM-JJ',
  'sm.card': '◇ TRIAGE-LINK — Fiche de blessé',
  'sm.atmist': 'Transmission AT-MIST',
  'sm.a': 'Âge / sexe', 'sm.t': 'Heure de l’incident', 'sm.m': 'Mécanisme',
  'sm.i': 'Blessures', 'sm.s': 'Signes', 'sm.tx': 'Soins',
  'sm.patient': 'Patient', 'sm.name': 'Nom', 'sm.dob': 'DDN', 'sm.sex': 'Sexe', 'sm.ageband': 'Tranche d’âge',
  'sm.mrn': 'NDA', 'sm.blood': 'Groupe sanguin', 'sm.nok': 'Proche à prévenir', 'sm.nokphone': 'Tél. du proche', 'sm.address': 'Adresse',
  'sm.incident': 'Incident', 'sm.timeofinjury': 'Heure de la blessure', 'sm.location': 'Lieu',
  'sm.injuries': 'Blessures', 'sm.none': 'Aucune enregistrée.',
  'sm.region': 'Région', 'sm.view': 'Vue', 'sm.type': 'Type', 'sm.severity': 'Gravité', 'sm.notes': 'Notes',
  'sm.burntbsa': 'SCB brûlée', 'sm.time': 'Heure', 'sm.vitals': 'Signes vitaux', 'sm.treatments': 'Soins',
  'sm.intervention': 'Intervention', 'sm.detail': 'Détail', 'sm.place': 'Lieu', 'sm.provider': 'Intervenant',
  'sm.handover': 'Remise', 'sm.clinician': 'Clinicien', 'sm.facility': 'Établissement', 'sm.nothandedover': 'Pas encore remis.',
  'sm.print': '🖨 Imprimer / PDF', 'sm.close': 'Fermer', 'sm.generated': 'Généré le',
  'view.anterior': 'face', 'view.posterior': 'dos',
}

const DICTS: Record<Lang, Dict> = { en: EN, fr: FR }

// Anatomical region names are generated by the core body-model (≈150 of them)
// and stored on the record in English (data stays language-neutral). They're
// translated only at render via regionLabel(). Keys are the base region name
// (no side prefix); the L/R anatomical-side prefix becomes G/D in French.
const REGION_FR: Dict = {
  // head / face
  Crown: 'Sommet du crâne', Forehead: 'Front', Nose: 'Nez', Mouth: 'Bouche', Chin: 'Menton',
  Eye: 'Œil', Cheek: 'Joue', Ear: 'Oreille',
  'Posterior scalp': 'Cuir chevelu postérieur', Occiput: 'Occiput', Nape: 'Nuque',
  // neck / trunk
  'Anterior neck': 'Cou antérieur', 'Posterior neck': 'Cou postérieur',
  'Upper abdomen': 'Abdomen supérieur', 'Mid back': 'Milieu du dos',
  'Lower abdomen': 'Abdomen inférieur', 'Lower back': 'Bas du dos',
  Shoulder: 'Épaule', Chest: 'Thorax', 'Upper back': 'Haut du dos', Pelvis: 'Bassin', Buttock: 'Fesse',
  // arm / hand
  'Upper arm': 'Bras', Elbow: 'Coude', Forearm: 'Avant-bras', Wrist: 'Poignet',
  Palm: 'Paume', 'Back of hand': 'Dos de la main',
  'Thumb proximal': 'Pouce proximal', 'Thumb distal': 'Pouce distal',
  'Index proximal': 'Index proximal', 'Index middle': 'Index médian', 'Index distal': 'Index distal',
  'Middle proximal': 'Majeur proximal', 'Middle middle': 'Majeur médian', 'Middle distal': 'Majeur distal',
  'Ring proximal': 'Annulaire proximal', 'Ring middle': 'Annulaire médian', 'Ring distal': 'Annulaire distal',
  'Little proximal': 'Auriculaire proximal', 'Little middle': 'Auriculaire médian', 'Little distal': 'Auriculaire distal',
  // leg / foot
  Thigh: 'Cuisse', Knee: 'Genou', 'Back of knee': 'Creux poplité', Shin: 'Tibia', Calf: 'Mollet',
  Ankle: 'Cheville', 'Foot dorsum': 'Dos du pied', Sole: 'Plante du pied',
  'Great toe': 'Gros orteil', '2nd toe': '2e orteil', '3rd toe': '3e orteil', '4th toe': '4e orteil', '5th toe': '5e orteil',
  // macro zones + off-silhouette fallbacks
  Head: 'Tête', Neck: 'Cou', Torso: 'Tronc', Arm: 'Bras', Hand: 'Main', Leg: 'Jambe', Foot: 'Pied',
  Abdomen: 'Abdomen', 'Left lower limb': 'Membre inférieur gauche', 'Right lower limb': 'Membre inférieur droit',
}

/**
 * Localise an anatomical region string (e.g. "L Forearm" → "G Avant-bras").
 * English is returned unchanged. The optional "L "/"R " anatomical-side prefix
 * maps to "G "/"D " (gauche/droite); the remainder is looked up in REGION_FR,
 * falling back to the original name so an unmapped region never blanks.
 */
export function regionLabel(region: string, lang: Lang): string {
  if (lang !== 'fr') return region
  const m = /^([LR]) (.+)$/.exec(region)
  if (m) return `${m[1] === 'L' ? 'G' : 'D'} ${REGION_FR[m[2]] ?? m[2]}`
  return REGION_FR[region] ?? region
}

export type TFn = (key: string, params?: Record<string, string | number>) => string

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; t: TFn }

const defaultT: TFn = (key, params) => {
  let s = EN[key] ?? key
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v))
  return s
}
// Default context = English, no-op setter — so components render fine even
// outside a provider (e.g. in unit tests).
const Ctx = createContext<LangCtx>({ lang: 'en', setLang: () => {}, t: defaultT })

function readStored(): Lang {
  try { return localStorage.getItem(STORAGE_KEY) === 'fr' ? 'fr' : 'en' } catch { return 'en' }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStored)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* ignore */ }
  }, [])

  useEffect(() => { document.documentElement.lang = lang }, [lang])

  const t = useCallback<TFn>((key, params) => {
    let s = DICTS[lang][key] ?? EN[key] ?? key
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v))
    return s
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLang(): LangCtx {
  return useContext(Ctx)
}
