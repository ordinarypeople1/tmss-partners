//! Names for the people who run the companies. Every name is a random pairing
//! from short per-country lists; none refers to a real person. The lists are
//! common given names and family names, so a pairing reads as a local name
//! without pointing at anyone.

use crate::rng::Rng;

struct Pool {
    masculine: &'static [&'static str],
    feminine: &'static [&'static str],
    family: &'static [&'static str],
    /// The family name comes first (Korea, Japan, China).
    family_first: bool,
}

const US: Pool = Pool {
    masculine: &[
        "James", "Michael", "Robert", "David", "William", "Richard", "Thomas", "Daniel",
        "Matthew", "Andrew", "Joshua", "Kevin", "Brian", "Eric", "Gregory", "Scott", "Carlos",
        "Marcus", "Jamal", "Luis", "Jason", "Ryan", "Steven", "Patrick",
    ],
    feminine: &[
        "Jennifer", "Sarah", "Jessica", "Emily", "Ashley", "Amanda", "Megan", "Laura", "Rachel",
        "Nicole", "Stephanie", "Rebecca", "Michelle", "Kimberly", "Angela", "Heather", "Maria",
        "Lauren", "Danielle", "Alicia", "Tiffany", "Courtney", "Erin", "Kelly",
    ],
    family: &[
        "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Garcia",
        "Rodriguez", "Wilson", "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson",
        "Martin", "Lee", "Thompson", "White", "Harris", "Clark", "Lewis", "Robinson", "Walker",
        "Young", "Allen", "King", "Wright", "Scott", "Hill", "Green", "Adams", "Baker", "Nelson",
        "Carter", "Mitchell", "Perez", "Roberts", "Turner", "Phillips", "Campbell", "Parker",
        "Evans", "Edwards", "Collins", "Stewart", "Morris", "Murphy", "Cook", "Rogers", "Reed",
        "Bailey", "Cooper", "Howard", "Ward", "Brooks", "Kelly", "Sanders", "Price",
    ],
    family_first: false,
};

const GB: Pool = Pool {
    masculine: &[
        "Oliver", "Harry", "George", "Jack", "Charlie", "Thomas", "James", "William", "Alfie",
        "Henry", "Edward", "Alistair", "Rupert", "Callum", "Rhys", "Gareth", "Owen", "Ewan",
        "Hamish", "Nigel", "Graham", "Simon", "Duncan", "Ian",
    ],
    feminine: &[
        "Olivia", "Amelia", "Isla", "Emily", "Poppy", "Sophie", "Charlotte", "Harriet", "Imogen",
        "Eleanor", "Fiona", "Catriona", "Siobhan", "Gemma", "Kirsty", "Nicola", "Joanna",
        "Rebecca", "Claire", "Hannah", "Lucy", "Victoria", "Abigail", "Rhiannon",
    ],
    family: &[
        "Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies",
        "Robinson", "Wright", "Thompson", "Evans", "Walker", "White", "Roberts", "Green", "Hall",
        "Wood", "Jackson", "Clarke", "Hughes", "Edwards", "Turner", "Hill", "Cooper", "Ward",
        "Morris", "Harris", "Lewis", "Patel", "Baker", "Mitchell", "Watson", "Harrison", "Morgan",
        "Kelly", "Price", "Bennett", "Griffiths", "Cox", "Marshall", "Fletcher", "Parry",
        "Lloyd", "Atkinson", "Pritchard", "Ellis", "Fraser", "MacLeod", "Campbell", "Stewart",
        "Murray", "Holmes", "Rowe", "Pearce", "Barker", "Saunders", "Webb", "Hammond",
        "Ashworth",
    ],
    family_first: false,
};

const DE: Pool = Pool {
    masculine: &[
        "Thomas", "Michael", "Andreas", "Stefan", "Markus", "Matthias", "Jürgen", "Frank",
        "Klaus", "Wolfgang", "Uwe", "Jörg", "Dirk", "Ralf", "Tobias", "Florian", "Sebastian",
        "Lukas", "Maximilian", "Johannes", "Bernd", "Holger", "Dieter", "Karsten",
    ],
    feminine: &[
        "Sabine", "Claudia", "Petra", "Andrea", "Susanne", "Birgit", "Monika", "Katrin",
        "Stefanie", "Anja", "Nicole", "Julia", "Katharina", "Christina", "Anna", "Lena", "Laura",
        "Ute", "Heike", "Silke", "Doris", "Ingrid", "Franziska", "Johanna",
    ],
    family: &[
        "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker",
        "Schulz", "Hoffmann", "Schäfer", "Koch", "Bauer", "Richter", "Klein", "Wolf",
        "Schröder", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hofmann", "Hartmann",
        "Lange", "Schmitt", "Werner", "Schmitz", "Krause", "Meier", "Lehmann", "Schmid",
        "Schulze", "Maier", "Köhler", "Herrmann", "König", "Walter", "Mayer", "Huber", "Kaiser",
        "Fuchs", "Peters", "Lang", "Scholz", "Möller", "Weiß", "Jung", "Hahn", "Schubert",
        "Vogel", "Friedrich", "Keller", "Günther", "Frank", "Berger", "Winkler", "Roth", "Beck",
        "Lorenz",
    ],
    family_first: false,
};

const FR: Pool = Pool {
    masculine: &[
        "Jean", "Pierre", "Michel", "Philippe", "Alain", "Nicolas", "Christophe", "François",
        "Laurent", "Olivier", "Thierry", "Éric", "Julien", "Sébastien", "Guillaume", "Antoine",
        "Mathieu", "Vincent", "Benoît", "Arnaud", "Hugo", "Théo", "Damien", "Yannick",
    ],
    feminine: &[
        "Marie", "Nathalie", "Isabelle", "Sylvie", "Catherine", "Sophie", "Valérie", "Christine",
        "Céline", "Sandrine", "Stéphanie", "Aurélie", "Camille", "Juliette", "Chloé", "Léa",
        "Manon", "Élodie", "Hélène", "Virginie", "Claire", "Anne", "Margaux", "Amélie",
    ],
    family: &[
        "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand",
        "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David",
        "Bertrand", "Roux", "Vincent", "Fournier", "Morel", "Girard", "André", "Lefèvre",
        "Mercier", "Dupont", "Lambert", "Bonnet", "François", "Martinez", "Legrand", "Garnier",
        "Faure", "Rousseau", "Blanc", "Guérin", "Muller", "Henry", "Roussel", "Nicolas",
        "Perrin", "Morin", "Mathieu", "Clément", "Gauthier", "Dumont", "Lopez", "Fontaine",
        "Chevalier", "Robin", "Masson", "Sanchez", "Gérard", "Nguyen", "Boyer", "Denis",
        "Lemaire", "Duval", "Joly", "Gautier",
    ],
    family_first: false,
};

const JP: Pool = Pool {
    masculine: &[
        "Hiroshi", "Takashi", "Kenji", "Satoshi", "Makoto", "Kazuya", "Yuki", "Daisuke",
        "Takeshi", "Shinji", "Masato", "Kenta", "Shota", "Ryo", "Naoki", "Tetsuya", "Yusuke",
        "Kazuhiro", "Hideo", "Toshiyuki", "Akira", "Koji", "Haruto", "Sota",
    ],
    feminine: &[
        "Yuko", "Keiko", "Naoko", "Tomoko", "Akiko", "Megumi", "Yumi", "Kaori", "Ayumi", "Mai",
        "Haruka", "Misaki", "Aya", "Emi", "Sachiko", "Noriko", "Rie", "Mayumi", "Asuka", "Nanami",
        "Yui", "Hina", "Kana", "Eri",
    ],
    family: &[
        "Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura",
        "Kobayashi", "Kato", "Yoshida", "Yamada", "Sasaki", "Yamaguchi", "Matsumoto", "Inoue",
        "Kimura", "Hayashi", "Shimizu", "Yamazaki", "Mori", "Abe", "Ikeda", "Hashimoto",
        "Yamashita", "Ishikawa", "Nakajima", "Maeda", "Fujita", "Ogawa", "Goto", "Okada",
        "Hasegawa", "Murakami", "Kondo", "Ishii", "Saito", "Sakamoto", "Endo", "Aoki", "Fujii",
        "Nishimura", "Fukuda", "Ota", "Miura", "Fujiwara", "Okamoto", "Matsuda", "Nakagawa",
        "Nakano", "Harada", "Ono", "Tamura", "Takeuchi", "Kaneko", "Wada", "Nakayama",
        "Ishida", "Ueda", "Morita",
    ],
    family_first: true,
};

const CN: Pool = Pool {
    masculine: &[
        "Wei", "Jun", "Hao", "Lei", "Qiang", "Jian", "Ming", "Tao", "Peng", "Bo", "Gang", "Yong",
        "Haoran", "Zihan", "Yuxuan", "Jianguo", "Zhiwei", "Wenbin", "Xiaodong", "Guoqiang",
        "Chen", "Kai", "Bin", "Hui",
    ],
    feminine: &[
        "Fang", "Na", "Min", "Jing", "Li", "Yan", "Juan", "Xia", "Ying", "Hong", "Lan", "Mei",
        "Xiaomei", "Yuting", "Shuang", "Lingling", "Xue", "Qian", "Huiling", "Jiayi", "Ruoxi",
        "Yuqing", "Dan", "Ping",
    ],
    family: &[
        "Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou", "Xu", "Sun",
        "Ma", "Zhu", "Hu", "Guo", "He", "Gao", "Lin", "Luo", "Zheng", "Liang", "Xie", "Song",
        "Tang", "Han", "Feng", "Deng", "Cao", "Peng", "Zeng", "Xiao", "Tian", "Dong", "Yuan",
        "Pan", "Yu", "Jiang", "Cai", "Du", "Ye", "Cheng", "Wei", "Su", "Lu", "Ding", "Ren",
        "Shen", "Yao", "Qin", "Kong", "Cui", "Zhong", "Tan", "Fan", "Xiong", "Liao", "Shi",
        "Jin", "Fu",
    ],
    family_first: true,
};

const KR: Pool = Pool {
    masculine: &[
        "Minjun", "Seojun", "Dohyun", "Jihoon", "Hyunwoo", "Junho", "Sungmin", "Youngho",
        "Jaehyun", "Donghyun", "Sangwoo", "Taeyang", "Kyungsoo", "Jinwoo", "Seungho",
        "Myungsoo", "Byungchul", "Jongsoo", "Daeho", "Hyunsoo", "Wonjae", "Joonyoung",
        "Sunghoon", "Inho",
    ],
    feminine: &[
        "Jiyoung", "Seoyeon", "Minji", "Soyeon", "Eunji", "Hyejin", "Yuna", "Jiwon", "Sujin",
        "Mikyung", "Eunkyung", "Youngmi", "Hyunjoo", "Sunhee", "Jieun", "Seojin", "Haeun",
        "Yejin", "Boram", "Nari", "Soojung", "Hyemin", "Dayoung", "Ara",
    ],
    family: &[
        "Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim", "Han", "Oh",
        "Seo", "Shin", "Kwon", "Hwang", "Ahn", "Song", "Jeon", "Hong", "Yoo", "Ko", "Moon",
        "Yang", "Son", "Bae", "Baek", "Heo", "Nam", "Noh", "Ha", "Kwak", "Sung", "Cha", "Joo",
        "Woo", "Koo", "Min", "Ryu", "Na", "Jin", "Ji", "Eom", "Chae", "Won", "Chun", "Bang",
        "Gong", "Hyun", "Ham", "Byun", "Yeom", "Yeo", "Choo", "Do", "So", "Seok", "Sun", "Seol",
        "Ma",
    ],
    family_first: true,
};

fn pool(country: &str) -> &'static Pool {
    match country {
        "KR" => &KR,
        "JP" => &JP,
        "CN" => &CN,
        "DE" => &DE,
        "FR" => &FR,
        "GB" => &GB,
        _ => &US,
    }
}

fn join(pool: &Pool, given: &str, family: &str) -> String {
    if pool.family_first {
        format!("{family} {given}")
    } else {
        format!("{given} {family}")
    }
}

/// A name that fits the country, and whether it is a feminine one, so a
/// portrait can match it.
pub fn name(rng: &mut Rng, country: &str) -> (String, bool) {
    let pool = pool(country);
    let feminine = rng.chance_bps(4_200);
    let list = if feminine { pool.feminine } else { pool.masculine };
    let given = list[rng.below(list.len() as u64) as usize];
    let family = pool.family[rng.below(pool.family.len() as u64) as usize];
    (join(pool, given, family), feminine)
}

/// The family name inside a full name made by `name`.
pub fn family_of<'a>(full: &'a str, country: &str) -> &'a str {
    if pool(country).family_first {
        full.split(' ').next().unwrap_or(full)
    } else {
        full.rsplit(' ').next().unwrap_or(full)
    }
}

/// A child who takes over the family firm keeps the family name: `drawn`'s
/// given name with `parent`'s family name.
pub fn heir(drawn: &str, parent: &str, country: &str) -> String {
    let pool = pool(country);
    let family = family_of(drawn, country);
    let given = if pool.family_first {
        drawn.strip_prefix(family).unwrap_or(drawn).trim_start()
    } else {
        drawn.strip_suffix(family).unwrap_or(drawn).trim_end()
    };
    join(pool, given, family_of(parent, country))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_follow_the_country() {
        let mut rng = Rng::new(7);
        for _ in 0..200 {
            let (kr, _) = name(&mut rng, "KR");
            assert!(KR.family.contains(&family_of(&kr, "KR")), "{kr}");
            let (de, _) = name(&mut rng, "DE");
            assert!(DE.family.contains(&family_of(&de, "DE")), "{de}");
        }
    }

    #[test]
    fn an_heir_keeps_the_family_name() {
        let mut rng = Rng::new(11);
        for country in ["KR", "JP", "CN", "DE", "FR", "GB", "US"] {
            let (parent, _) = name(&mut rng, country);
            let (drawn, _) = name(&mut rng, country);
            let child = heir(&drawn, &parent, country);
            assert_ne!(child, "");
            assert_eq!(family_of(&parent, country), family_of(&child, country));
        }
    }
}
