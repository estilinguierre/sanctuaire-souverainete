const GOTHAM_DATA = {
  nodes: [
    // Persons
    { id: 'p1', type: 'PERSON', label: 'Ahmed Benali', x: null, y: null,
      props: { DOB: '1978-03-15', Nationalité: 'Française', Statut: 'Surveillé', Risque: 'CRITIQUE', 'N° Passeport': 'FR8824701' } },
    { id: 'p2', type: 'PERSON', label: 'Sarah Chen', x: null, y: null,
      props: { DOB: '1985-07-22', Nationalité: 'Chinoise/Singapourienne', Statut: 'Actif', Risque: 'ÉLEVÉ', 'N° Passeport': 'SG9934521' } },
    { id: 'p3', type: 'PERSON', label: 'Viktor Kozlov', x: null, y: null,
      props: { DOB: '1970-11-08', Nationalité: 'Russe', Statut: 'Fugitif', Risque: 'CRITIQUE', 'N° Passeport': 'RU4412089' } },
    { id: 'p4', type: 'PERSON', label: 'Maria Santos', x: null, y: null,
      props: { DOB: '1990-04-30', Nationalité: 'Brésilienne', Statut: 'Inconnu', Risque: 'MOYEN', 'N° Passeport': 'BR7765234' } },
    { id: 'p5', type: 'PERSON', label: 'James Thornton', x: null, y: null,
      props: { DOB: '1965-09-12', Nationalité: 'Britannique', Statut: 'Actif', Risque: 'ÉLEVÉ', 'N° Passeport': 'GB2209876' } },
    { id: 'p6', type: 'PERSON', label: 'Nadia Al-Hassan', x: null, y: null,
      props: { DOB: '1982-06-19', Nationalité: 'Émiratie', Statut: 'Actif', Risque: 'MOYEN', 'N° Passeport': 'AE5513302' } },
    // Organizations
    { id: 'o1', type: 'ORG', label: 'Nexus Corp Pte.', x: null, y: null,
      props: { Fondée: '2015', Pays: 'Singapour', Type: 'Société Écran', Capital: '10M SGD', 'Reg. N°': 'SG-2015-NX' } },
    { id: 'o2', type: 'ORG', label: 'Gulf Trading Ltd', x: null, y: null,
      props: { Fondée: '2010', Pays: 'Émirats Arabes', Type: 'Commerce', Capital: '50M AED', 'Reg. N°': 'AE-2010-GT' } },
    { id: 'o3', type: 'ORG', label: 'Horizon Finance SA', x: null, y: null,
      props: { Fondée: '2018', Pays: 'Suisse', Type: 'Finance', Capital: '100M CHF', 'Reg. N°': 'CH-2018-HF' } },
    { id: 'o4', type: 'ORG', label: 'Atlas Holdings', x: null, y: null,
      props: { Fondée: '2012', Pays: 'Îles Caïmans', Type: 'Holding', Capital: 'Inconnu', 'Reg. N°': 'KY-2012-AH' } },
    // Locations
    { id: 'l1', type: 'LOCATION', label: 'Zurich, CH', x: null, y: null,
      props: { Pays: 'Suisse', Type: 'Ville', Lat: '47.3769° N', Lon: '8.5417° E' } },
    { id: 'l2', type: 'LOCATION', label: 'Dubaï, EAU', x: null, y: null,
      props: { Pays: 'Émirats Arabes', Type: 'Ville', Lat: '25.2048° N', Lon: '55.2708° E' } },
    { id: 'l3', type: 'LOCATION', label: 'Singapour', x: null, y: null,
      props: { Pays: 'Singapour', Type: 'Cité-État', Lat: '1.3521° N', Lon: '103.8198° E' } },
    { id: 'l4', type: 'LOCATION', label: 'Genève, CH', x: null, y: null,
      props: { Pays: 'Suisse', Type: 'Ville', Lat: '46.2044° N', Lon: '6.1432° E' } },
    // Events
    { id: 'e1', type: 'EVENT', label: 'Réunion Dubaï 15/01', x: null, y: null,
      props: { Date: '2026-01-15', Lieu: 'Burj Khalifa, Dubaï', Type: 'Rencontre', Participants: '3', Statut: 'Confirmé' } },
    { id: 'e2', type: 'EVENT', label: 'Virement 2,3M EUR', x: null, y: null,
      props: { Date: '2026-02-03', Montant: '2 300 000 EUR', Source: 'Nexus Corp', Destination: 'Horizon Finance', Statut: 'Exécuté' } },
    { id: 'e3', type: 'EVENT', label: 'Forum Davos Jan-26', x: null, y: null,
      props: { Date: '2026-01-22', Lieu: 'Davos, Suisse', Type: 'Conférence', Participants: '2', Statut: 'Confirmé' } },
    { id: 'e4', type: 'EVENT', label: 'Transfert Crypto 890K', x: null, y: null,
      props: { Date: '2026-03-10', Montant: '890 000 USDT', 'Wallet Src': '0x4a2f...8e12', 'Wallet Dst': '0xbc91...3f77', Statut: 'Suspecté' } },
    // Documents
    { id: 'd1', type: 'DOCUMENT', label: 'Contrat NX-2025', x: null, y: null,
      props: { Date: '2025-11-01', Classification: 'CONFIDENTIEL', Pages: '42', Format: 'PDF', Hash: 'a3f9...12bc' } },
    { id: 'd2', type: 'DOCUMENT', label: 'Relevés Banc. T4', x: null, y: null,
      props: { Date: '2025-12-31', Classification: 'SECRET', Pages: '156', Format: 'PDF', Hash: '9c4e...7d21' } },
  ],

  edges: [
    { id: 'r1',  source: 'p1', target: 'o1', label: 'CONTRÔLE',         props: { Depuis: '2020', Participat.: '100%' } },
    { id: 'r2',  source: 'p1', target: 'p3', label: 'ASSOCIÉ',          props: { Depuis: '2018', Fréquence: 'Mensuelle' } },
    { id: 'r3',  source: 'p3', target: 'o2', label: 'PROPRIÉTAIRE',     props: { Part: '85%' } },
    { id: 'r4',  source: 'o1', target: 'o3', label: 'FILIALE',          props: { Depuis: '2019' } },
    { id: 'r5',  source: 'o3', target: 'l1', label: 'ENREGISTRÉ',       props: { Adresse: 'Bahnhofstrasse 12' } },
    { id: 'r6',  source: 'o2', target: 'l2', label: 'OPÈRE',            props: { Bureau: 'DIFC Tower A' } },
    { id: 'r7',  source: 'p2', target: 'o1', label: 'EMPLOYÉ',          props: { Rôle: 'Directrice Fin.', Depuis: '2021' } },
    { id: 'r8',  source: 'p1', target: 'e1', label: 'A PARTICIPÉ',      props: {} },
    { id: 'r9',  source: 'p3', target: 'e1', label: 'A PARTICIPÉ',      props: {} },
    { id: 'r10', source: 'p5', target: 'e1', label: 'A PARTICIPÉ',      props: {} },
    { id: 'r11', source: 'e2', target: 'o3', label: 'IMPLIQUE',         props: {} },
    { id: 'r12', source: 'e2', target: 'p1', label: 'INITIÉ PAR',       props: {} },
    { id: 'r13', source: 'p4', target: 'o2', label: 'EMPLOYÉ',          props: { Rôle: 'Directrice', Depuis: '2022' } },
    { id: 'r14', source: 'p5', target: 'o3', label: 'ADM. CONSEIL',     props: { Depuis: '2020' } },
    { id: 'r15', source: 'd1', target: 'o1', label: 'RÉFÉRENCE',        props: {} },
    { id: 'r16', source: 'd2', target: 'e2', label: 'DOCUMENTE',        props: {} },
    { id: 'r17', source: 'p2', target: 'l3', label: 'RÉSIDE',           props: { Adresse: 'Marina Bay' } },
    { id: 'r18', source: 'e3', target: 'p5', label: 'IMPLIQUE',         props: {} },
    { id: 'r19', source: 'e3', target: 'p2', label: 'IMPLIQUE',         props: {} },
    { id: 'r20', source: 'o1', target: 'l3', label: 'ENREGISTRÉ',       props: { Adresse: 'Raffles Place' } },
    { id: 'r21', source: 'o4', target: 'o1', label: 'CONTRÔLE',         props: { Part: '100%' } },
    { id: 'r22', source: 'p6', target: 'o2', label: 'FONDATEUR',        props: {} },
    { id: 'r23', source: 'p6', target: 'e1', label: 'A ORGANISÉ',       props: {} },
    { id: 'r24', source: 'e4', target: 'p3', label: 'INITIÉ PAR',       props: {} },
    { id: 'r25', source: 'e4', target: 'o4', label: 'IMPLIQUE',         props: {} },
    { id: 'r26', source: 'o3', target: 'l4', label: 'BUREAU',           props: { Adresse: 'Rue du Rhône 14' } },
  ],

  alerts: [
    { id: 'a1', severity: 'CRITIQUE', title: 'Mouvement de fonds suspect', desc: 'Virement atypique 2,3M EUR détecté', date: '2026-02-04', entity: 'e2' },
    { id: 'a2', severity: 'ÉLEVÉ', title: 'Rencontre sujets surveillés', desc: 'Benali et Kozlov réunis à Dubaï', date: '2026-01-16', entity: 'e1' },
    { id: 'a3', severity: 'ÉLEVÉ', title: 'Transaction crypto non déclarée', desc: '890K USDT vers wallet inconnu', date: '2026-03-11', entity: 'e4' },
    { id: 'a4', severity: 'MOYEN', title: 'Document classifié accédé', desc: 'Relevés bancaires consultés hors procédure', date: '2026-02-20', entity: 'd2' },
    { id: 'a5', severity: 'FAIBLE', title: 'Nouveau passeport détecté', desc: 'Kozlov voyage sous nouveau document', date: '2026-01-10', entity: 'p3' },
  ],

  investigations: [
    { id: 'inv1', name: 'Opération Phénix', status: 'ACTIVE', entities: 12, analyst: 'Agent Moreau', created: '2026-01-08' },
    { id: 'inv2', name: 'Dossier Réseau K', status: 'EN REVUE', entities: 7, analyst: 'Agent Duval', created: '2025-11-20' },
    { id: 'inv3', name: 'Enquête Finance Ombre', status: 'FERMÉE', entities: 20, analyst: 'Agent Martin', created: '2025-09-01' },
  ]
};

const NODE_COLORS = {
  PERSON:   { fill: '#1a0a0a', stroke: '#ff6b6b', icon: '●' },
  ORG:      { fill: '#0a1a1a', stroke: '#4ecdc4', icon: '◆' },
  LOCATION: { fill: '#0a1a0a', stroke: '#6bcb77', icon: '▲' },
  EVENT:    { fill: '#1a1a0a', stroke: '#ffd93d', icon: '◉' },
  DOCUMENT: { fill: '#0f0a1a', stroke: '#a29bfe', icon: '▪' },
};

const RISK_COLORS = {
  CRITIQUE: '#ff4757',
  ÉLEVÉ:    '#ff7f50',
  MOYEN:    '#ffd32a',
  FAIBLE:   '#7bed9f',
};
