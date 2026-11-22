[![DOI](https://zenodo.org/badge/58004955.svg)](https://zenodo.org/badge/latestdoi/58004955)

# MicroSPAT

MicroSPAT (Microsatellite Parameterized Analysis Tools) analyzes capillary electrophoresis fragment data from ABI 3730 `.fsa` files and genotypes microsatellites.

It is built for samples that are mixtures of genomes, such as malaria infections that contain several parasite clones. A sample can carry any number of alleles at a locus, at very unequal proportions, and a real minor allele can sit exactly where a major allele's stutter falls. MicroSPAT makes no diploid assumptions. It models stutter from your own data, estimates each sample's multiplicity of infection (MOI), assigns each peak a probability of being a true allele, and reports within-sample allele proportions corrected for amplification bias.

Version 3 is a rewrite and is currently in **beta**. It is a single desktop application with no Python, no separate server to start, and one file per analysis. The `v3.0.0-beta.1` pre-release is on the [releases page](https://github.com/EPPIcenter/MicroSPAT/releases); please report issues on [GitHub](https://github.com/EPPIcenter/MicroSPAT/issues).

## Install

Download the installer for your platform from the [releases page](https://github.com/EPPIcenter/MicroSPAT/releases):

| Platform | File |
| --- | --- |
| macOS (Apple silicon and Intel) | `MicroSPAT_<version>_universal.dmg` |
| Windows | `MicroSPAT_<version>_x64-setup.exe` |
| Linux | `MicroSPAT_<version>_amd64.AppImage` or `.deb` |

The builds are not code-signed, so the operating system asks for confirmation the first time:

- On macOS, open the app once, then go to **System Settings > Privacy & Security** and click **Open Anyway**.
- On Windows, click **More info**, then **Run anyway**.

Platform requirements:

- macOS 12 or later.
- Windows 10 or 11 with the WebView2 runtime. Windows 11 and updated Windows 10 include it. On a computer without it, the installer downloads it, which needs an internet connection. For a computer that is never online, install the [WebView2 Evergreen Standalone Installer](https://developer.microsoft.com/microsoft-edge/webview2/) first.
- Linux with WebKitGTK 4.1, which means Ubuntu 22.04, Debian 12, Fedora 38, or later. The `.deb` package registers the `.microspat` file type. The AppImage doesn't, and on Ubuntu it needs `libfuse2`, or run it with `--appimage-extract-and-run`. If the window stays blank on a Wayland session, start the app with `WEBKIT_DISABLE_DMABUF_RENDERER=1`.

To see the application with data in it before you load your own, choose **File > Load Demo Data**. The demo is a synthetic polyclonal study with every step already analyzed.

## Learn MicroSPAT

The first time MicroSPAT opens, it offers a guided tour. The tour walks through the demo study in about five minutes and explains each screen, from plates to exported alleles. To start it later, choose **Help > Take the Tour**, or click **Take the tour** in the workspace menu at the top of the sidebar.

The [user guide](docs/user-guide.md) covers installation, a first analysis of your own plates step by step, the input file formats, and troubleshooting.

## Analyze a study

The sidebar follows the order of the work:

1. **Ladders.** Check that your size standard is listed. HD ROX 400 and the GeneScan 500 and 600 standards are built in.
2. **Loci and locus sets.** Define each marker's dye, size range, and repeat length, then group the markers that you analyze together. You can import loci from a CSV file.
3. **Plates.** Import zip archives or folders of `.fsa` files. MicroSPAT sizes every well against the ladder, shows which wells failed, and checks each plate's quality: capillaries whose dyes are not separated, dye-to-dye pull-up rates used during calling, crosstalk above what the default limits cover, weak injections, ladders that disagree with the plate, and signal in negative controls, each with what to do. You can repair a ladder by clicking its peaks. Then apply a plate map, which is a CSV file that assigns each well to a sample for each locus.
4. **Bin estimators.** Cluster the peak sizes seen across your runs into allele bins, then adjust the bins by hand.
5. **Artifact estimators.** Learn how tall stutter peaks are relative to their parent peak, as a function of fragment size, from runs that contain one clone.
6. **Quantification bias.** Optional. Estimate how much shorter alleles are over-amplified, from control strains mixed in known proportions.
7. **Genotyping projects.** Call alleles for every sample at every locus, run the probabilistic annotation across the project, review and correct calls against the trace, and export.

Each page tells you which earlier step it is waiting for. When you change something upstream, such as a bin or a parameter, every result that depended on it is marked as out of date with the reason.

Open **Settings** from the sidebar (or press Cmd/Ctrl+,) to adjust workspace quality and negative-control limits or set application preferences.

Example input files are in the `demo_files` folder.

### Exports

A genotyping project exports three CSV files:

- **Alleles, wide.** One row per sample and one column per locus, with alleles joined by `;`.
- **Alleles, long.** One row per called allele, with size, height, proportion, bias-corrected proportion, probability, MOI, and whether the call was reviewed.
- **Peak data.** Every peak with all of its annotations.

## Share your data

Everything in an analysis lives in one workspace file with the extension `.microspat`. The file holds the raw traces, plate maps, calibrations, calls, and your manual edits. To share an analysis, send the file. To open one, double-click it, or choose **File > Open Workspace**.

The first workspace is created at `Documents/MicroSPAT/Workspace.microspat`. Use **File > Save Workspace As** to make a copy.

## Run on a server

The same application also runs as a single binary that serves the interface to a browser. Use this mode on a shared lab machine or over SSH:

```sh
microspat-server --workspace study.microspat --open
```

The server listens on `127.0.0.1:7878` and has no authentication. Bind it to another address with `--host` only on a network that you trust. Browsers upload the files that you import. The server refuses requests that name other files on its disk unless you start it with `--allow-host-paths`.

## What changed from version 2

- One application and one workspace file replace the Electron shell, the frozen Python server, and the application-wide database.
- Importing, sizing and checking the quality of a 96-well plate takes about 80 ms. Re-analyzing a locus across 2,000 runs takes about 100 ms.
- Ladder fitting assigns peaks with dynamic programming and interpolates with a monotone cubic. Candidate peaks are judged against the well's own ladder height, so weak extra peaks can't displace the ladder. Every well is checked against the other wells on its plate, and a well that disagrees with them is refitted or flagged.
- Peak heights are measured above the local baseline, which is robust to the negative dips that tall peaks in other dyes leave in raw 3730 data.
- The stutter model is fitted to the dense, low part of the observed stutter ratios, so minor clones that sit on a stutter position don't inflate it. A stutter class must appear in most of the runs that could show it.
- The probabilistic model uses allele prevalence and MOI. In version 2 under Python 3 a defect emptied the prevalence tables, so peaks were judged on their artifact score alone.
- Plate-wide pull-up rates are measured automatically and used when calling peaks, with fixed fallback limits for crosstalk, unmeasured dye pairs, unseparated capillaries, unchecked plates, and off-scale points. Peaks at a point where the dyes aren't separated carry a spectral flag.
- The amplification-bias correction is exact for any number of alleles.
- When a sample has several runs at a locus, a run without an off-scale peak is preferred over one with.
- The continuous wavelet transform peak finder is gone. The relative-maximum finder remains.
- A genotyping call can be marked as reviewed, and the mark survives re-analysis while the call is unchanged.

## Validation status

The defaults were chosen and checked on a designed mixture-control experiment: single lab strains and mixtures of two to seven strains at graded proportions, typed at 27 loci, run three times on 36 plates across four 3730 instruments. On capillaries with a working spectral calibration:

| Expected share of the sample | Alleles found |
| --- | --- |
| 30% or more | 98% to 100% |
| 10% to 30% | 72% to 86% |
| 3% to 10% | 28% to 37% |

Between 2% and 3% of calls are false. Most of the missed minor alleles are peaks below the 200 RFU height limit or peaks no taller than the stutter expected at their position. Ladder sizing was checked on 4,608 wells: 3 wells were sized wrongly without being refused, and 2 good ladders were refused.

These numbers come from one laboratory's panel and instruments. Before you rely on MicroSPAT for a study, run controls of known composition through your own panel. The engine README describes the measurements behind each default.

## Build from source

You need Rust 1.94 or later, Node.js 24 or later, and pnpm. On Linux you also need the [Tauri system packages](https://v2.tauri.app/start/prerequisites/).

```sh
pnpm install        # install the build tools and the interface's dependencies
pnpm dev            # run the desktop app with hot reload
pnpm build          # build the installer for this platform
pnpm serve          # build and run the browser mode
pnpm check          # format check, lints, and all unit tests
```

To publish installers for all platforms, set the version in `Cargo.toml` and push a tag named `v<version>`. The release workflow builds the installers and attaches them to a draft release.

The repository has the following parts:

| Path | Contents |
| --- | --- |
| `crates/microspat-core` | The analysis library: file parsing, ladder sizing, peak calling, bins, stutter model, quantification, and mixture genotyping |
| `crates/microspat-engine` | The workspace file, the analysis projects, and the API that the interface calls |
| `crates/microspat-server` | The browser mode |
| `src-tauri` | The desktop application and packaging |
| `ui` | The interface, written in React and TypeScript |

Each part has its own README with details for developers.

## License

MicroSPAT is licensed under the GNU Affero General Public License, version 3 or later. See the `LICENSE` file.
