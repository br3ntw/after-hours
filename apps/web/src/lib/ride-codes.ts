/**
 * Three-letter ride codes, the shorthand operations teams use on radios, boards and logs.
 * Fictional, like everything else in Lanternfall Park.
 */
const CODES: Record<string, string> = {
  "undertow-expedition": "UDX",
  "lighthouse-leap": "LHL",
  "gullwing-carousel": "GWC",
  "riptide-rapids": "RTR",
  "captains-crossing": "CPX",
  "gearspring-runaway": "GSR",
  "brass-comet": "BRC",
  "tinkers-teacups": "TKT",
  "canyon-cable-cars": "CCC",
  "pendulum-plunge": "PDP",
  "borealis-drift": "BDR",
  "skyward-gondolas": "SKG",
  "glacier-run": "GLR",
  "polar-parade-hall": "PPH",
  "fireflight-hollow": "FFH",
  "rootbound-rapids": "RBR",
  "mosslight-maze": "MLM",
  "owlwatch-tower": "OWT",
  "hearthsong-theater": "HST",
  "nebula-spinner": "NBS",
  "orbit-9": "OR9",
  "comet-bumpers": "CMB",
  "satellite-swing": "STS",
  "moonbeam-arcade-theater": "MAT",
};

export function rideCode(slug: string): string {
  return (
    CODES[slug] ??
    slug
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 3)
      .toUpperCase()
  );
}
