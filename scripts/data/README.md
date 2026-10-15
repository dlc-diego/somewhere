# Capital points

`capitals-source.json` is a checked-in extract of Natural Earth's public-domain 1:10m populated places. It stores one selected capital (or government seat) per playable country, matched by ISO alpha-2 and an explicitly checked city name, then keyed by our canonical ISO alpha-3 IDs. Routine generation uses this local file and makes no network calls.

Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_populated_places_simple.geojson. Extracted on October 15, 2026; original GeoJSON SHA-256: `fd3fa867a320cbd5c5b6bb5bc550afeec2939fb2cef688e508007282a55ac42f`. Natural Earth IDs are retained in the extract. City coordinates are representative points, not surveyed government-building positions.

Selection follows `world-countries`' primary capital where practical, with explicit choices of Mbabane for Eswatini and Sri Jayawardenepura Kotte for Sri Lanka. Other multiple-capital cases use Pretoria (South Africa), Sucre (Bolivia), Amsterdam (Netherlands), Kuala Lumpur (Malaysia), Porto-Novo (Benin), and Yamoussoukro (Côte d'Ivoire). Other co-capitals are not separate answers or aliases for a different city. Ramallah is used as Palestine's administrative seat, matching the country metadata, and Jerusalem for Israel; these are gameplay choices, not recognition of territorial claims. Jakarta follows the source dataset during Indonesia's capital transition.

Nauru has no official capital and is absent from the populated-places file. Yaren is included as its government district, using a manually specified, approximate point at 0.55° S, 166.92° E. Ngerulmud uses the source's nearby Melekeok point. Search includes spelling variants for the same selected city (for example Kyiv/Kiev and Astana/Nur-Sultan), rather than historical capitals in other locations.

These are static geographic data choices and can lag capital relocations. Review this extract and the in-game notes deliberately when updating geography. The country database containing the adapted points remains distributed under ODbL alongside its existing attribution; Natural Earth's input geography is public domain.
