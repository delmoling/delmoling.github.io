# References

## Core Stroop Literature

Stroop, J. R. (1935). Studies of interference in serial verbal reactions. *Journal of Experimental Psychology, 18*(6), 643-662. https://doi.org/10.1037/h0054651

Regard, M., Potgieter, J., & Van Zomeren, A. (1982). The Victoria version of the Stroop Test.

MacLeod, C. M. (1991). Half a century of research on the Stroop effect: An integrative review. *Psychological Bulletin, 109*(2), 163-203. https://doi.org/10.1037/0033-2909.109.2.163

## Reliability, Scoring, and Psychometrics

de Schryver, M., Hughes, J., Rosseel, Y., & De Houwer, J. (2018). Unreliable difference scores in the Stroop task? *Psychological Assessment, 30*(5), 691-700. https://doi.org/10.1037/pas0000501

Parola, A., Bellina, M., Gabbatore, I., & Bosco, F. M. (2021). Reassessing the reliability of the Stroop test in standard and emotionally salient contexts. *Frontiers in Psychology, 12*, 647932. https://doi.org/10.3389/fpsyg.2021.647932

## Web-Based Experimental Implementation

de Leeuw, J. R. (2015). jsPsych: A JavaScript library for creating behavioral experiments in a Web browser. *Behavior Research Methods, 47*(1), 1-12. https://doi.org/10.3758/s13428-014-0458-y

## Data Infrastructure and Reproducibility

Supabase documentation. https://supabase.com/docs

## Project-Specific Note

This project implements a desktop-only adaptation of a Victoria-style Stroop protocol in:

- ensino/stroop-victoria.js
- supabase/functions/stroop-ingest/index.ts

Normative outputs currently reported by the project include:

- raw participant metrics
- stratum mean and SD (age band x schooling band)
- z-score
- percentile
- T-score
