# VAPS Lab

Interactive teaching simulator for volume-assured pressure support non-invasive ventilation.

## Run locally

No build step or dependencies are required. From this directory:

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000 in a modern browser.

## Tests

With Node.js installed:

```sh
node --test tests/*.test.mjs
```

## Features and model

- Tidal-volume or alveolar-ventilation targets, pressure-support limits and adaptation.
- Fixed or intelligent backup rate; flow triggering, rise time and cycling; inspiratory-time limits.
- Synchronized pressure, volume, flow and semi-sinusoidal Pmus waveforms, with timed/patient-triggered breath markers.
- Single-compartment respiratory mechanics, CO2 mass balance, pure chemoreflex delay, and proportional Pmus and respiratory-rate responses.
- Baseline Pmus calibrated for unassisted eupnea using fixed teaching-reference mechanics (C = 100 mL/cmH2O, R = 2 cmH2O/(L/s)); actual patient mechanics independently determine ventilation. Calibration remains fixed during step changes.
- Linked metabolic VCO2, reference CO2 and required alveolar ventilation. The time constant applies to CO2 storage, with no additional controller smoothing.
- Step-change scenarios and ventilation trends.

Expand **Model details & sources** in the simulator for equations, assumptions and literature references. This is an illustrative educational model, not a device-specific algorithm or a clinical decision tool.

## Source layout

- `dist/model.mjs`: physiology and device simulation
- `dist/app.mjs`: interface and plotting
- `dist/scenarios.mjs`: step-change scenarios
- `dist/index.html`: controls, modeling documentation and sources
- `dist/style.css`: presentation
- `tests/`: model and UI wiring tests

VAPS Lab model 4.0; reference-mechanics calibration updated October 17, 2026.
