const cards = require("./cards");

let highest = 0;

for (let card of cards.white) {
    if (card.text.length > highest) highest = card.text.length;
}

for (let card of cards.black) {
    if (card.text.length > highest) highest = card.text.length;
}

console.log(cards.white.length);
console.log(highest);