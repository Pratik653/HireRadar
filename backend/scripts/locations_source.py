"""Curated input for ``build_locations.py``.

Country and subdivision codes and names come from ISO 3166 (via pycountry, which
packages the Debian iso-codes data). This file adds what ISO does not provide:
continent grouping, the employment hubs listed under each country, common
aliases, and English names where ISO uses a local one.
"""

# Continents follow the UN M49 geoscheme (Americas split into North and South).
CONTINENTS: dict[str, tuple[str, list[str]]] = {
    "asia": (
        "Asia",
        """AE QA BH SA KW OM IN SG MY JP KR CN HK TW MO ID TH VN PH PK BD LK NP BT MV IL JO LB IQ IR
        SY YE PS TR CY GE AM AZ KZ UZ KG TJ TM AF MN MM KH LA BN TL KP""".split(),
    ),
    "europe": (
        "Europe",
        """DE GB FR NL CH SE DK NO FI IE ES IT BE AT PL PT CZ SK HU RO BG GR HR SI RS BA ME MK AL
        LU LI MC SM VA AD MT IS EE LV LT UA BY MD RU GI IM JE GG FO AX""".split(),
    ),
    "north_america": (
        "North America",
        """US CA MX GT BZ SV HN NI CR PA CU JM HT DO PR BS BB TT AG DM GD KN LC VC
        BM GL AW CW KY TC VG VI""".split(),
    ),
    "south_america": ("South America", "BR AR CL CO PE VE EC BO PY UY GY SR".split()),
    "africa": (
        "Africa",
        """ZA EG KE NG MA GH DZ TN LY SD SS ET SO DJ ER UG TZ RW BI CD CG CM CF TD GA GQ ST AO ZM
        ZW MW MZ NA BW LS SZ MG MU SC KM SN GM GN GW SL LR CI ML BF NE TG BJ MR CV""".split(),
    ),
    "oceania": ("Oceania", "AU NZ FJ PG SB VU NC PF WS TO KI TV NR PW FM MH GU".split()),
}

# Selectable groups inside a continent.
GROUPS: dict[str, tuple[str, str, list[str]]] = {
    "gcc": ("GCC", "asia", ["AE", "QA", "BH", "SA", "KW", "OM"]),
}

# Region words used in remote-job eligibility text ("Remote — EMEA"). Values are
# continent/group ids or country codes. Not selectable; used for matching only.
REGION_ALIASES: dict[str, list[str]] = {
    "gcc": ["gcc"],
    "gulf": ["gcc"],
    "middle east": ["gcc", "IL", "JO", "LB", "IQ", "IR", "SY", "YE", "PS", "TR", "EG", "CY"],
    "mena": ["gcc", "IL", "JO", "LB", "IQ", "IR", "SY", "YE", "PS", "TR", "EG", "MA", "DZ", "TN", "LY"],
    "emea": ["europe", "africa", "gcc", "IL", "JO", "LB", "IQ", "TR", "CY"],
    "europe": ["europe"],
    "eu": ["europe"],
    "dach": ["DE", "AT", "CH"],
    "nordics": ["SE", "DK", "NO", "FI", "IS"],
    "benelux": ["BE", "NL", "LU"],
    "asia": ["asia"],
    "apac": ["asia", "oceania"],
    "asia pacific": ["asia", "oceania"],
    "anz": ["AU", "NZ"],
    "africa": ["africa"],
    "north america": ["north_america"],
    "latam": ["south_america", "MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA", "CU", "DO", "PR"],
    "latin america": ["south_america", "MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA", "CU", "DO", "PR"],
    "south america": ["south_america"],
    "americas": ["north_america", "south_america"],
    "oceania": ["oceania"],
}

# Short display names where the ISO name is formal ("Korea, Republic of").
COUNTRY_NAMES = {
    "RU": "Russia",
    "CD": "DR Congo",
    "CG": "Republic of the Congo",
    "TW": "Taiwan",
    "PS": "Palestine",
    "VA": "Vatican City",
    "MK": "North Macedonia",
    "FM": "Micronesia",
    "VG": "British Virgin Islands",
    "VI": "U.S. Virgin Islands",
}

# Extra country aliases (lower-case, matched case-insensitively).
COUNTRY_ALIASES: dict[str, list[str]] = {
    "AE": ["uae", "u.a.e", "u.a.e.", "emirates"],
    "SA": ["ksa", "saudi", "kingdom of saudi arabia"],
    "BH": ["kingdom of bahrain"],
    "OM": ["sultanate of oman"],
    "US": ["usa", "u.s.", "u.s.a.", "united states of america"],
    "GB": ["uk", "u.k.", "great britain", "britain", "england", "scotland", "wales", "northern ireland"],
    "KR": ["korea", "republic of korea"],
    "CZ": ["czech republic"],
    "TR": ["turkey", "turkiye"],
    "NL": ["holland", "the netherlands"],
    "HK": ["hong kong sar"],
    "CI": ["ivory coast", "cote d'ivoire"],
    "VN": ["viet nam"],
    "AU": ["aus"],
    "NZ": ["aotearoa"],
}

# Upper-case abbreviations, matched case-sensitively in location fields only.
COUNTRY_CODES_CASED: dict[str, list[str]] = {
    "US": ["US", "USA"],
    "GB": ["UK"],
    "AE": ["UAE"],
    "SA": ["KSA"],
}

# Country names that are also common words or names. In free text (not a
# location field) they are ignored; in location fields they need context.
RISKY_COUNTRY_WORDS = {
    "jordan",
    "chad",
    "georgia",
    "turkey",
    "niger",
    "guinea",
    "mali",
    "jersey",
    "england",
    "wales",
    "aus",
    "korea",
    "saudi",
}

# Countries whose ISO subdivisions are offered in the selector.
SUBDIVISION_COUNTRIES = ["IN", "US", "CA", "AU", "DE"]
# ISO subdivision types to leave out (tiny outlying areas).
SKIP_SUBDIVISION_TYPES = {"Outlying area"}

SUBDIVISION_NAMES = {
    "DE-BY": "Bavaria",
    "DE-HE": "Hesse",
    "DE-NW": "North Rhine-Westphalia",
    "DE-NI": "Lower Saxony",
    "DE-RP": "Rhineland-Palatinate",
    "DE-SN": "Saxony",
    "DE-ST": "Saxony-Anhalt",
    "DE-TH": "Thuringia",
    "DE-MV": "Mecklenburg-Western Pomerania",
}
SUBDIVISION_ALIASES: dict[str, list[str]] = {
    "US-DC": ["washington dc", "washington d.c.", "d.c."],
    "IN-DL": ["ncr", "delhi ncr", "nct of delhi"],
    "IN-OD": ["orissa"],
    "IN-TS": ["telangana"],
}

# Employment hubs. Key: country code (cities directly under the country) or ISO
# subdivision code. Each city is "Name" or ("Name", [aliases]).
# A city marked with "*" is the default when the same name exists elsewhere in
# the catalog and the text gives no other clue (e.g. London → United Kingdom).
CITIES: dict[str, list] = {
    # --- GCC
    "AE": [
        ("Dubai", ["dxb", "difc", "dubai internet city", "jlt", "dubai media city"]),
        ("Abu Dhabi", ["abudhabi", "auh", "adgm", "masdar", "masdar city"]),
        ("Sharjah", ["shj"]),
        "Ajman",
        "Ras Al Khaimah",
    ],
    "QA": [("Doha", ["lusail"])],
    "BH": ["Manama"],
    "SA": [
        ("Riyadh", ["ruh"]),
        ("Jeddah", ["jidda", "jiddah"]),
        ("Dammam", ["khobar", "al khobar", "dhahran"]),
        ("NEOM", []),
    ],
    "KW": [("Kuwait City", [])],
    "OM": ["Muscat"],
    # --- Rest of Asia
    "IN-KA": [("Bengaluru", ["bangalore"]), "Mysuru"],
    "IN-MH": [("Mumbai", ["bombay", "navi mumbai"]), "Pune", "Nagpur"],
    "IN-TS": ["Hyderabad*"],
    "IN-DL": [("New Delhi", ["delhi"])],
    "IN-HR": [("Gurugram", ["gurgaon"])],
    "IN-UP": [("Noida", ["greater noida"]), "Lucknow"],
    "IN-WB": [("Kolkata", ["calcutta"])],
    "IN-TN": [("Chennai", ["madras"]), "Coimbatore"],
    "IN-GJ": ["Ahmedabad", "Gandhinagar"],
    "IN-KL": [("Kochi", ["cochin"]), ("Thiruvananthapuram", ["trivandrum"])],
    "IN-RJ": ["Jaipur"],
    "IN-OD": ["Bhubaneswar"],
    "IN-CH": ["Chandigarh"],
    "SG": ["Singapore"],
    "MY": [("Kuala Lumpur", ["kl"]), "Cyberjaya", ("Penang", ["george town"])],
    "JP": ["Tokyo", "Osaka", "Kyoto", "Fukuoka", "Yokohama"],
    "KR": ["Seoul", "Busan", ("Seongnam", ["pangyo"])],
    "CN": ["Beijing", "Shanghai", "Shenzhen", "Hangzhou", "Guangzhou", "Chengdu"],
    "HK": ["Hong Kong"],
    "TW": ["Taipei", "Hsinchu"],
    "ID": ["Jakarta", "Bandung"],
    "TH": ["Bangkok"],
    "VN": [("Ho Chi Minh City", ["saigon"]), "Hanoi"],
    "PH": [("Manila", ["metro manila", "makati", "taguig"]), "Cebu"],
    "PK": ["Karachi", "Lahore", "Islamabad"],
    "BD": ["Dhaka"],
    "LK": ["Colombo"],
    "IL": [("Tel Aviv", ["tel aviv-yafo", "tel-aviv"]), "Jerusalem", "Haifa"],
    "JO": ["Amman"],
    "LB": ["Beirut"],
    "TR": ["Istanbul", "Ankara", "Izmir"],
    "KZ": ["Almaty", "Astana"],
    # --- Europe
    "DE-BE": "Berlin",
    "DE-BY": [("Munich", ["münchen", "muenchen"]), ("Nuremberg", ["nürnberg", "nuernberg"])],
    "DE-HE": [("Frankfurt", ["frankfurt am main"]), "Darmstadt", "Wiesbaden"],
    "DE-HH": "Hamburg",
    "DE-NW": [
        ("Cologne", ["köln", "koeln"]),
        ("Düsseldorf", ["dusseldorf", "duesseldorf"]),
        "Dortmund",
        "Essen",
        "Bonn",
        "Aachen",
    ],
    "DE-BW": "Stuttgart Karlsruhe Heidelberg Mannheim".split(),
    "DE-SN": ["Leipzig", "Dresden"],
    "DE-ST": ["Magdeburg", ("Halle (Saale)", ["halle", "halle an der saale"])],
    "DE-NI": [("Hanover", ["hannover"]), ("Braunschweig", ["brunswick"])],
    "DE-HB": "Bremen",
    "GB": [
        "London*",
        "Manchester",
        "Edinburgh",
        "Cambridge*",
        "Oxford",
        "Bristol",
        "Birmingham",
        "Glasgow",
        "Belfast",
        "Leeds",
    ],
    "FR": ["Paris", "Lyon", "Toulouse", "Sophia Antipolis", "Grenoble", "Marseille"],
    "NL": ["Amsterdam", "Rotterdam", ("The Hague", ["den haag"]), "Eindhoven", "Utrecht", "Delft"],
    "CH": [("Zurich", ["zürich"]), ("Geneva", ["genève", "geneve"]), "Basel", "Lausanne", "Zug"],
    "SE": ["Stockholm", ("Gothenburg", ["göteborg"]), ("Malmö", ["malmo"])],
    "DK": [("Copenhagen", ["københavn"]), "Aarhus"],
    "NO": "Oslo Bergen Trondheim".split(),
    "FI": "Helsinki Espoo Tampere Oulu".split(),
    "IE": "Dublin Cork Galway Limerick".split(),
    "ES": ["Madrid", "Barcelona", "Valencia", ("Málaga", ["malaga"]), "Seville"],
    "IT": [("Milan", ["milano"]), ("Rome", ["roma"]), ("Turin", ["torino"]), "Bologna"],
    "BE": ["Brussels", ("Antwerp", ["antwerpen"]), ("Ghent", ["gent"]), "Leuven"],
    "AT": [("Vienna", ["wien"]), "Graz", "Linz"],
    "PL": [
        ("Warsaw", ["warszawa"]),
        ("Kraków", ["krakow", "cracow"]),
        ("Wrocław", ["wroclaw"]),
        ("Gdańsk", ["gdansk"]),
        ("Poznań", ["poznan"]),
    ],
    "PT": [("Lisbon", ["lisboa"]), "Porto"],
    "CZ": [("Prague", ["praha"]), "Brno"],
    "RO": ["Bucharest", "Cluj-Napoca"],
    "HU": "Budapest",
    "GR": "Athens",
    "EE": "Tallinn",
    "LV": "Riga",
    "LT": "Vilnius",
    "UA": [("Kyiv", ["kiev"]), "Lviv"],
    "LU": [("Luxembourg City", [])],
    "RS": "Belgrade",
    # --- North America
    "US-CA": [
        ("San Francisco", ["sf", "san francisco bay area", "bay area"]),
        ("Los Angeles", ["la"]),
        "San Jose*",
        "Palo Alto",
        "Mountain View",
        "San Diego",
        "Sunnyvale",
        "Menlo Park",
    ],
    "US-NY": [("New York City", ["nyc", "new york", "manhattan", "brooklyn"])],
    "US-TX": ["Austin", "Dallas", "Houston", "San Antonio"],
    "US-WA": ["Seattle", "Redmond", "Bellevue"],
    "US-MA": ["Boston", "Cambridge"],
    "US-IL": "Chicago",
    "US-GA": "Atlanta",
    "US-CO": ["Denver", "Boulder"],
    "US-DC": [("Washington", ["washington, d.c.", "washington dc", "washington d.c."])],
    "US-VA": ["Arlington", "Reston"],
    "US-NC": ["Raleigh", "Durham", "Charlotte"],
    "US-FL": "Miami Orlando Tampa".split(),
    "US-PA": "Pittsburgh Philadelphia".split(),
    "US-OR": "Portland",
    "US-AZ": "Phoenix",
    "US-UT": ["Salt Lake City"],
    "US-MN": "Minneapolis",
    "US-MI": "Detroit",
    "US-NJ": ["Jersey City", "Newark", "Princeton"],
    "CA-ON": ["Toronto", "Ottawa", "Waterloo", "Mississauga", "London"],
    "CA-BC": "Vancouver",
    "CA-QC": [("Montreal", ["montréal"]), ("Quebec City", ["québec city"])],
    "CA-AB": "Calgary Edmonton".split(),
    "CA-MB": "Winnipeg",
    "CA-NS": "Halifax",
    "MX": [("Mexico City", ["cdmx", "ciudad de méxico", "ciudad de mexico"]), "Guadalajara", "Monterrey"],
    "CR": [("San José", ["san jose, costa rica"])],
    "PA": [("Panama City", [])],
    # --- South America
    "BR": [
        ("São Paulo", ["sao paulo"]),
        "Rio de Janeiro",
        ("Florianópolis", ["florianopolis"]),
        "Belo Horizonte",
        "Curitiba",
    ],
    "AR": ["Buenos Aires", ("Córdoba", ["cordoba"])],
    "CL": "Santiago",
    "CO": [("Bogotá", ["bogota"]), ("Medellín", ["medellin"])],
    "PE": "Lima",
    "UY": "Montevideo",
    "EC": "Quito",
    # --- Africa
    "ZA": ["Johannesburg", ("Cape Town", []), "Pretoria", "Durban"],
    "EG": ["Cairo", "Alexandria"],
    "KE": "Nairobi",
    "NG": ["Lagos", "Abuja"],
    "MA": "Casablanca Rabat".split(),
    "GH": "Accra",
    "RW": "Kigali",
    "TN": "Tunis",
    "ET": ["Addis Ababa"],
    "SN": "Dakar",
    # --- Oceania
    "AU-NSW": "Sydney",
    "AU-VIC": "Melbourne",
    "AU-QLD": ["Brisbane", "Gold Coast"],
    "AU-WA": "Perth",
    "AU-SA": "Adelaide",
    "AU-ACT": "Canberra",
    "NZ": "Auckland Wellington Christchurch".split(),
}
