"use strict";
/**
 * Feature: Phase 6 — Carbon Footprint Estimation per page.
 * Based on WebsiteCarbon API methodology:
 * - Page weight (bytes) → energy consumption → CO2 in grams.
 * Reference: https://www.websitecarbon.com/methodology/
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateCarbon = estimateCarbon;
// Approximate constants from WebsiteCarbon methodology
const BYTES_PER_KWH = 670_000; // ~670KB per kWh of energy used to serve a page
const GRID_CO2_G_PER_KWH = 475; // Global average grid emissions in gCO2/kWh (2023)
const GREEN_THRESHOLD = 1.4; // gCO2 — under this is "green"
const YELLOW_THRESHOLD = 3.2; // gCO2 — between green and yellow
function estimateCarbon(contentLength, includeTransfer = true) {
    if (contentLength <= 0)
        contentLength = 0;
    // Total transfer = page size × multiplier for round-trip + mobile overhead
    const multiplier = includeTransfer ? 12 : 1; // ~12x accounts for full page load cycle
    const bytesTransferred = contentLength * multiplier;
    // Energy = bytes / 670,000 bytes per Wh (for serving)
    // Add display energy (~0.091 Wh per page view globally averaged)
    const servingEnergyWh = bytesTransferred / BYTES_PER_KWH / 1000;
    const displayEnergyWh = 0.091;
    const totalEnergyKwh = (servingEnergyWh + displayEnergyWh) / 1000;
    // CO2 = energy × grid factor
    const co2Grams = Math.round(totalEnergyKwh * GRID_CO2_G_PER_KWH * 10000) / 10000;
    let rating;
    if (co2Grams < GREEN_THRESHOLD)
        rating = 'green';
    else if (co2Grams < YELLOW_THRESHOLD)
        rating = 'yellow';
    else
        rating = 'red';
    return {
        bytesTransferred,
        energyWh: Math.round((servingEnergyWh + displayEnergyWh) * 10000) / 10000,
        co2Grams,
        rating,
    };
}
//# sourceMappingURL=carbon-estimator.js.map