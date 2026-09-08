export const SITE = {
    name: "TMN Decorating & Maintenance",
    shortName: "TMN",
    tagline:
        "Domestic & commercial painting, decorating and property maintenance, done properly.",
    phoneDisplay: "07736 325643",
    phoneHref: "tel:+447736325643",
    whatsappNumber: "447736325643",
    email: "info@tmndecorating.co.uk",
    emailHref: "mailto:info@tmndecorating.co.uk",
};

export const waLink = (text) =>
    `https://wa.me/${SITE.whatsappNumber}${
        text ? `?text=${encodeURIComponent(text)}` : ""
    }`;

export const SERVICES = [
    {
        id: "01",
        title: "Interior Painting & Decorating",
        blurb:
            "Sharp lines, smooth walls and woodwork finished with care — your home treated like our own.",
        points: [
            "Walls, ceilings & woodwork",
            "Feature walls & wallpaper",
            "Minor repairs & preparation included",
            "Clean, tidy and on schedule",
        ],
    },
    {
        id: "02",
        title: "Exterior Painting & Decorating",
        blurb:
            "Weather-ready finishes that keep facades, doors and windows looking their best, year after year.",
        points: [
            "Facades, render & masonry",
            "Doors, windows & cladding",
            "Preparation and repair first",
            "Access & safety handled",
        ],
    },
    {
        id: "03",
        title: "Commercial Painting",
        blurb:
            "Offices, shops, restaurants and communal spaces — finished around the hours that suit your business.",
        points: [
            "Offices & retail",
            "Out-of-hours working",
            "Communal & landlord spaces",
            "Minimal disruption",
        ],
    },
    {
        id: "04",
        title: "Property Maintenance",
        blurb:
            "The jobs that keep a property healthy — from plaster repairs to planned, ongoing upkeep.",
        points: [
            "Repairs & plastering",
            "Touch-ups & refreshes",
            "Planned, regular upkeep",
            "Domestic & commercial",
        ],
    },
];

export const PROJECTS = [
    {
        img: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
        label: "Painting — Residential",
        title: "Luxury interior repaint",
    },
    {
        img: "https://images.unsplash.com/photo-1638885930125-85350348d266?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
        label: "Painting — Detail",
        title: "Drawing room finish",
    },
    {
        img: "https://images.unsplash.com/photo-1615873968403-89e068629265?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
        label: "Decorating — Feature wall",
        title: "Deep green feature wall",
    },
    {
        img: "https://images.unsplash.com/photo-1600684388091-627109f3cd60?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
        label: "Painting — Kitchen",
        title: "Modern kitchen finish",
    },
];
