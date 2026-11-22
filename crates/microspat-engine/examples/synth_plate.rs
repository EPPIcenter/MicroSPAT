//! Writes a synthetic 96-well plate as FSA files (a folder) and a zip, plus
//! its plate map, for trying imports by hand or from the UI.
//!
//! cargo run -p microspat-engine --example synth_plate -- <out dir> [seed] [plate name]

use microspat_core::synth::{generate_plate, SynthSpec};
use microspat_engine::api::demo::{demo_plate_map, write_dir, write_zip};

fn main() {
    let mut args = std::env::args().skip(1);
    let out = std::path::PathBuf::from(
        args.next()
            .expect("usage: synth_plate <out dir> [seed] [plate name]"),
    );
    let seed: u64 = args.next().and_then(|s| s.parse().ok()).unwrap_or(1);
    let name = args.next().unwrap_or_else(|| format!("SYNTH-{seed}"));
    let spec = SynthSpec {
        plate_name: name.clone(),
        ..SynthSpec::demo(seed)
    };
    let wells = generate_plate(&spec).expect("valid synthetic spec");
    std::fs::create_dir_all(&out).expect("create output dir");
    write_dir(&out.join(&name), &wells).expect("write folder");
    write_zip(&out.join(format!("{name}.zip")), &wells).expect("write zip");
    std::fs::write(
        out.join(format!("{name}_plate_map.csv")),
        demo_plate_map(seed as usize, &spec, &wells),
    )
    .expect("write map");
    let mut loci =
        String::from("Label,Min. Base Length,Max. Base Length,Nucleotide Repeat Length,Color\n");
    for l in &spec.loci {
        loci.push_str(&format!(
            "{},{},{},{},{:?}\n",
            l.label, l.min_size, l.max_size, l.repeat_length, l.color
        ));
    }
    std::fs::write(out.join("loci.csv"), loci).expect("write loci");
    println!(
        "wrote {name} (folder, zip, plate map) and loci.csv to {}",
        out.display()
    );
}
