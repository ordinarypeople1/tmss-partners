//! Names for the people who run the companies. Every name is a random pairing
//! from two short lists; none refers to a real person.

use crate::rng::Rng;

const MASCULINE: [&str; 24] = [
    "Alan", "Carl", "Evan", "Glen", "Ivan", "Kent", "Marc", "Owen", "Reid", "Theo", "Vince",
    "Abel", "Cole", "Eli", "Gus", "Ian", "Kirk", "Miles", "Otis", "Ray", "Tariq", "Wade", "Yusuf",
    "Andre",
];
const FEMININE: [&str; 24] = [
    "Beth", "Dana", "Faye", "Hope", "Jill", "Lena", "Nina", "Paige", "Sara", "Uma", "Wendy",
    "Bree", "Dora", "Fern", "Hana", "Joan", "Lois", "Nell", "Priya", "Sonia", "Vera", "Ximena",
    "Zoe", "Mei",
];
const LAST: [&str; 60] = [
    "Albrecht",
    "Barlow",
    "Castellan",
    "Dunmere",
    "Eastlake",
    "Fairbanks",
    "Greeley",
    "Hartnell",
    "Ingram",
    "Jessup",
    "Kowalczyk",
    "Lindqvist",
    "Marlowe",
    "Nakagawa",
    "Okonkwo",
    "Pemberton",
    "Quintero",
    "Rasmussen",
    "Sandoval",
    "Thackeray",
    "Underwood",
    "Vasquez",
    "Whitcombe",
    "Yamada",
    "Zielinski",
    "Ashworth",
    "Bianchi",
    "Calloway",
    "Delacroix",
    "Eriksen",
    "Fontaine",
    "Gallagher",
    "Hendricks",
    "Ishikawa",
    "Jankowski",
    "Kaplan",
    "Lombardi",
    "Mwangi",
    "Novak",
    "Olsen",
    "Patel",
    "Rahman",
    "Schreiber",
    "Takahashi",
    "Urquhart",
    "Vandermeer",
    "Winslow",
    "Abernethy",
    "Brannigan",
    "Corbett",
    "Devereux",
    "Ellsworth",
    "Farrow",
    "Goldberg",
    "Halloran",
    "Iverson",
    "Kimura",
    "Lachance",
    "Mercado",
    "Nguyen",
];

/// A name, and whether it is a feminine one, so a portrait can match it.
pub fn name(rng: &mut Rng) -> (String, bool) {
    let feminine = rng.chance_bps(4_200);
    let list = if feminine { &FEMININE } else { &MASCULINE };
    let first = list[rng.below(list.len() as u64) as usize];
    let last = LAST[rng.below(LAST.len() as u64) as usize];
    (format!("{first} {last}"), feminine)
}
