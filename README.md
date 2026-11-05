# Välfärdsindex för Skånes kommuner

En webbapp som visar hur Skånes 33 kommuner placerar sig bland Sveriges 290 kommuner i ett välfärdsindex av 19 officiella mått, år för år sedan 2002.

**Appen:** https://straffspark.github.io/valfard-i-skane/

## Mått

Ekonomi: mediannettoinkomst, låg ekonomisk standard (alla och barn), ekonomiskt bistånd.
Arbete: sysselsättningsgrad, arbetslöshet, långtidsarbetslöshet, unga som varken arbetar eller studerar.
Utbildning: behörighet till gymnasiets yrkesprogram, gymnasieexamen inom fyra år, eftergymnasial utbildning.
Hälsa: medellivslängd (män och kvinnor), ohälsotal, förtida dödsfall.
Trygghet: anmälda våldsbrott, otrygghet ute sen kväll.
Boende: trångboddhet.
Delaktighet: valdeltagande i kommunvalet.

## Metod

För varje mått och år rangordnas alla kommuner. Indexvärdet är snittet av kommunens placeringar. Ett mått räknas in ett år när minst 280 kommuner har värden, så de tidiga åren bygger på färre mått (7 år 2002, alla 19 från 2020). Före 2023 används Arbetsförmedlingens serie för arbetslöshet. Kärnindexet använder de sju mått som finns alla år.

## Data

`scripts/build_data.py` hämtar data från [Kolada](https://www.kolada.se) och skriver `site/data.json`. GitHub Actions kör skriptet vid varje push och den 3:e varje månad, och publicerar sedan sidan på GitHub Pages.
