use include_flate::flate;

flate!(pub static PREINJECT_JS: str from "gen/injection/preinject.js");
flate!(pub static POSTINJECT_JS: str from "gen/injection/postinject.js");
flate!(pub static MINIMUM_CSS: str from "../client/assets/css/minimum.css");
flate!(pub static RELEASE_NOTES_JSON: str from "assets/release-notes.json");
