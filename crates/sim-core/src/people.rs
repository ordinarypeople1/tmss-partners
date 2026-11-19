//! Names for the people who run the companies. Every name is a random pairing
//! from two short lists; none refers to a real person.

use crate::rng::Rng;

const FIRST: [&str; 48] = [
    "Alan", "Beth", "Carl", "Dana", "Evan", "Faye", "Glen", "Hope", "Ivan", "Jill", "Kent", "Lena", "Marc", "Nina",
    "Owen", "Paige", "Reid", "Sara", "Theo", "Uma", "Vince", "Wendy", "Abel", "Bree", "Cole", "Dora", "Eli", "Fern",
    "Gus", "Hana", "Ian", "Joan", "Kirk", "Lois", "Miles", "Nell", "Otis", "Priya", "Ray", "Sonia", "Tariq", "Vera",
    "Wade", "Ximena", "Yusuf", "Zoe", "Andre", "Mei",
];
const LAST: [&str; 60] = [
    "Albrecht", "Barlow", "Castellan", "Dunmere", "Eastlake", "Fairbanks", "Greeley", "Hartnell", "Ingram", "Jessup",
    "Kowalczyk", "Lindqvist", "Marlowe", "Nakagawa", "Okonkwo", "Pemberton", "Quintero", "Rasmussen", "Sandoval",
    "Thackeray", "Underwood", "Vasquez", "Whitcombe", "Yamada", "Zielinski", "Ashworth", "Bianchi", "Calloway",
    "Delacroix", "Eriksen", "Fontaine", "Gallagher", "Hendricks", "Ishikawa", "Jankowski", "Kaplan", "Lombardi",
    "Mwangi", "Novak", "Olsen", "Patel", "Rahman", "Schreiber", "Takahashi", "Urquhart", "Vandermeer", "Winslow",
    "Abernethy", "Brannigan", "Corbett", "Devereux", "Ellsworth", "Farrow", "Goldberg", "Halloran", "Iverson",
    "Kimura", "Lachance", "Mercado", "Nguyen",
];

pub fn name(rng: &mut Rng) -> String {
    let first = FIRST[rng.below(FIRST.len() as u64) as usize];
    let last = LAST[rng.below(LAST.len() as u64) as usize];
    format!("{first} {last}")
}
