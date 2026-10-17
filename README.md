# Kelime & İşlem

A small Turkish word-and-numbers game in the spirit of *1 Kelime 1 İşlem*. Four rounds: two **Kelime** (build the longest word from 8 letters and a joker) and two **İşlem** (reach a target number from 6 numbers).

Plain HTML/CSS/JS, no build step — open `index.html` or serve the folder statically.

- Words: at least 5 letters, 1 point per letter.
- İşlem: 9 points for an exact hit, one less per step away (minimum 1).
- Word list: TDK headwords from [mertemin/turkish-word-list](https://github.com/mertemin/turkish-word-list) plus generated plurals.
