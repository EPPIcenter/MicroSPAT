/** Sidebar sections and their routes: one source for nav and router. */
import {
  Boxes,
  Dna,
  FlaskConical,
  FolderKanban,
  Grid3x3,
  Layers,
  ListTree,
  Ruler,
  Scale,
  Settings,
  ShieldCheck,
  Waves,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  /** One-line purpose of the section. */
  blurb: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: 'Data',
    items: [
      {
        path: '/plates',
        label: 'Plates',
        icon: Grid3x3,
        blurb:
          'Import plates of FSA files, check ladder sizing per well, fix failed ladders by hand, apply a plate map, and check signal strength per dye.',
      },
      {
        path: '/samples',
        label: 'Samples',
        icon: FlaskConical,
        blurb: 'Samples created from plate maps, with every run (well × locus) that belongs to them.',
      },
    ],
  },
  {
    label: 'Setup',
    items: [
      {
        path: '/loci',
        label: 'Loci',
        icon: Dna,
        blurb: 'Microsatellite markers: size range, repeat length and dye. Import many from CSV.',
      },
      {
        path: '/locus-sets',
        label: 'Locus sets',
        icon: Layers,
        blurb: 'Named groups of loci analyzed together. Every project uses one.',
      },
      {
        path: '/ladders',
        label: 'Ladders',
        icon: Ruler,
        blurb: 'Size standards: expected peak sizes, dye, and the settings used to find and fit ladder peaks.',
      },
      {
        path: '/controls',
        label: 'Controls',
        icon: ShieldCheck,
        blurb: 'Known strains with their alleles per locus, used for quantification-bias estimation and QC.',
      },
    ],
  },
  {
    label: 'Calibration',
    items: [
      {
        path: '/bin-estimators',
        label: 'Bin estimators',
        icon: ListTree,
        blurb: 'Find allele bins per locus by clustering peak sizes across runs, then adjust bins by hand.',
      },
      {
        path: '/artifact-estimators',
        label: 'Artifact estimators',
        icon: Waves,
        blurb: 'Model stutter and other artifact peaks as a function of the parent peak, per distance class, with breakpoints.',
      },
      {
        path: '/quant-bias',
        label: 'Quantification bias',
        icon: Scale,
        blurb: 'Estimate size-dependent amplification bias from control mixtures of known proportions.',
      },
    ],
  },
  {
    label: 'Genotyping',
    items: [
      {
        path: '/projects',
        label: 'Projects',
        icon: FolderKanban,
        blurb:
          'Call alleles in mixed samples: any number per locus, probabilistic calls, MOI and allele prevalence, manual curation, export.',
      },
    ],
  },
]

export const SETTINGS_NAV: NavItem = {
  path: '/settings',
  label: 'Settings',
  icon: Settings,
  blurb: 'Workspace quality limits and application preferences.',
}

export const DEV_NAV: NavItem = {
  path: '/dev/gallery',
  label: 'Component gallery',
  icon: Boxes,
  blurb: 'Every reusable component with mock data.',
}

export const ALL_NAV_ITEMS: NavItem[] = [...NAV.flatMap((g) => g.items), SETTINGS_NAV]
