# CLASSIFICATION_LOGIC.md - NOVA Classification System

**Project:** UPF Scanner
**Last Updated:** 2026-03-21
**Classification Version:** 1.2.1 (Barcode-First with Rule-Based Fallback)

> This document details the NOVA food classification system and our implementation for identifying ultra-processed foods. The system uses a three-tier pipeline: barcode lookup via OpenFoodFacts (primary), OFF ingredient analysis API (secondary), and a local rule-based classifier (fallback).

---

## Table of Contents
1. [NOVA Classification Overview](#nova-classification-overview)
2. [NOVA Groups Explained](#nova-groups-explained)
3. [Ultra-Processed Indicators (NOVA 4)](#ultra-processed-indicators-nova-4)
4. [Classification Pipeline](#classification-pipeline)
5. [Local Rule-Based Classifier (Fallback Only)](#local-rule-based-classifier-fallback-only)
6. [Edge Cases](#edge-cases)
7. [Examples](#examples)
8. [Sources & References](#sources--references)

---

## NOVA Classification Overview

### What is NOVA?

**NOVA** is a food classification system developed by researchers at the University of São Paulo, Brazil. It categorizes foods into 4 groups based on the **extent and purpose of food processing**, not nutritional content.

**Key Principle:** The more processed a food is, the more it diverges from its natural state and potentially impacts health.

### Why NOVA Matters

Research links ultra-processed foods (NOVA 4) to:
- Obesity and weight gain
- Type 2 diabetes
- Cardiovascular disease
- Cancer risk
- Overall mortality

**Goal of this extension:** Help users identify and reduce ultra-processed food consumption.

---

## NOVA Groups Explained

### NOVA 1: Unprocessed or Minimally Processed Foods

**Definition:** Natural foods with no processing, or minimal processing (cleaning, cutting, drying, freezing, pasteurization).

**Examples:**
- Fresh, chilled, or frozen fruits and vegetables
- Grains and legumes (rice, beans, lentils)
- Nuts and seeds (unsalted, unroasted)
- Fresh or frozen meat, fish, poultry
- Eggs
- Milk (pasteurized but unsweetened)
- Plain yogurt (no sugar/flavoring)

**Key Characteristics:**
- Single ingredient or very few ingredients
- No additives (except for preservation like pasteurization)
- Still recognizable as food from nature

**Badge Color:** 🟢 Green

---

### NOVA 2: Processed Culinary Ingredients

**Definition:** Substances extracted from NOVA 1 foods or from nature, used in cooking. Not meant to be eaten alone.

**Examples:**
- Salt
- Sugar
- Honey
- Butter
- Lard
- Vegetable oils (olive, sunflower, coconut)
- Starches

**Key Characteristics:**
- Derived from Group 1 foods by pressing, grinding, drying, refining
- Used to prepare, season, or cook Group 1 foods
- Rarely consumed alone

**Badge Color:** 🟡 Yellow (usually not displayed as standalone products on supermarket sites)

---

### NOVA 3: Processed Foods

**Definition:** Foods made by adding NOVA 2 ingredients (salt, sugar, oil) to NOVA 1 foods. Processing includes preservation methods like canning, bottling, fermentation.

**Examples:**
- Canned vegetables (with salt)
- Canned fish (in oil or brine)
- Fruits in syrup
- Cheese (from milk + salt + cultures)
- Bread (from flour + water + salt + yeast)
- Salted or sugared nuts

**Key Characteristics:**
- Usually 2-3 ingredients
- Recognizable as modified versions of Group 1 foods
- Processing mainly to increase durability or enhance taste
- **No ultra-processed ingredients** (see NOVA 4)

**Badge Color:** 🟠 Orange

---

### NOVA 4: Ultra-Processed Food and Drink Products

**Definition:** Industrial formulations made mostly from substances extracted from foods, with little to no whole foods. Contain additives that enhance taste, appearance, or shelf life.

**Examples:**
- Soft drinks
- Sweet or savory packaged snacks (crisps, biscuits)
- Ice cream
- Chocolate bars
- Chicken nuggets, fish sticks
- Hot dogs, sausages (with many additives)
- Instant noodles, soups
- Ready meals (frozen pizzas, microwave meals)
- Breakfast cereals (with sugar, flavoring, colors)
- Margarine (with emulsifiers, colors)
- Mass-produced bread (with emulsifiers, preservatives)

**Key Characteristics:**
- **5+ ingredients** (often 10-30+)
- Contains **ultra-processed ingredients** not used in home cooking:
  - **Additives:** Emulsifiers, colors, sweeteners, flavor enhancers
  - **E-numbers:** E621 (MSG), E951 (aspartame), E407 (carrageenan)
  - **Modified substances:** Modified starches, hydrolyzed proteins, maltodextrin
  - **Industrial ingredients:** High-fructose corn syrup, invert sugar, protein isolates
- Often designed to be "hyper-palatable" (hard to stop eating)
- Long shelf life

**Badge Color:** 🔴 Red

---

## Ultra-Processed Indicators (NOVA 4)

> These are the "red flags" that indicate a food is ultra-processed.

### 1. E-Numbers (Food Additives)

E-numbers are codes for food additives approved in the EU. Not all are problematic, but many indicate ultra-processing.

> **Note — common names and E-numbers are the same thing**
>
> UK labels are legally permitted to use either the E-number *or* the common name for an additive. For example:
> - `Gelling Agent: Pectin` = `E440`
> - `Emulsifier: Lecithin` = `E322`
> - `Preservative: Sodium Benzoate` = `E211`
>
> The OFF ingredient analysis API normalises common names to their E-number equivalents, so the tooltip may show `E440` even when the label says `Pectin`. This is correct — they refer to the same substance.
>
> **Local classifier vs OFF API:** The local rule-based classifier (`lib/nova-indicators.js`) handles many common names via
> `NOVA4_ADDITIVE_PATTERNS` (e.g. `lecithin`, `flavourings`, `glucose syrup`, `cellulose`). The OFF API takes a broader
> view and may flag additives the local classifier misses. This means tooltip indicators from an OFF analysis may differ
> from what the local fallback detects — both are correct within their own methodology.

#### **E1xx - Colors**
Ultra-processed indicator if present:
- E100-E199 (all artificial and some natural colors)
- Examples: E102 (Tartrazine), E110 (Sunset Yellow), E120 (Cochineal)

**Common in:** Soft drinks, candy, packaged snacks, desserts

#### **E2xx - Preservatives**
Ultra-processed indicator if present:
- E200-E299 (synthetic preservatives)
- Examples: E211 (Sodium benzoate), E220 (Sulfur dioxide), E250 (Sodium nitrite)

**Common in:** Processed meats, soft drinks, dried fruits

**Exception:** Some natural preservatives (E300 Vitamin C) are less concerning, but still indicate processing.

#### **E3xx - Antioxidants & Acidity Regulators**
Some are ultra-processed indicators:
- E320 (BHA), E321 (BHT) - synthetic antioxidants
- E330 (Citric acid) - often industrial, but less concerning if naturally derived

**Common in:** Oils, fats, snacks

#### **E4xx - Emulsifiers, Stabilizers, Thickeners**
Strong ultra-processed indicators:
- E407 (Carrageenan)
- E412 (Guar gum)
- E415 (Xanthan gum)
- E440 (Pectin — industrially extracted via acid hydrolysis; added 2026-03-20)
- E460 (Cellulose — derived from wood pulp via industrial acid hydrolysis; added 2026-03-20)
- E471 (Mono- and diglycerides of fatty acids)
- E481 (Sodium stearoyl lactylate)

**Common in:** Ice cream, margarine, baked goods, sauces

#### **E5xx - Acidity Regulators & Anti-Caking Agents**
Some are ultra-processed indicators:
- E500-E599
- Example: E551 (Silicon dioxide)

#### **E6xx - Flavor Enhancers**
Strong ultra-processed indicators:
- E620-E629 (Glutamates)
- **E621 (MSG - Monosodium glutamate)** - very common

**Common in:** Savory snacks, instant noodles, soups, processed meats

#### **E9xx - Sweeteners & Glazing Agents**
Strong ultra-processed indicators:
- E950 (Acesulfame K)
- E951 (Aspartame)
- E952 (Cyclamate)
- E954 (Saccharin)
- E955 (Sucralose)

**Common in:** "Sugar-free" or "diet" products, soft drinks, gum

#### **E14xx - Modified Starches**
Strong ultra-processed indicators (all 11 codes are flagged):
- E1404 (Oxidised starch)
- E1410 (Monostarch phosphate)
- E1412 (Distarch phosphate)
- E1413 (Phosphated distarch phosphate)
- E1414 (Acetylated distarch phosphate)
- E1420 (Acetylated starch)
- E1422 (Acetylated distarch adipate)
- E1440 (Hydroxy propyl starch)
- E1442 (Hydroxy propyl distarch phosphate)
- E1450 (Starch sodium octenyl succinate)
- E1451 (Acetylated oxidised starch)

> **Note:** Products rarely list E14xx codes on labels — they typically say "Modified Maize Starch" or similar. The `NOVA4_ADDITIVE_PATTERNS` text-matching in `lib/nova-indicators.js` handles those cases; E14xx codes are flagged if they appear explicitly on a label or in OFF data.

**Common in:** Ready meals, sauces, soups, processed snacks

### 2. Industrial Ingredients (Non-E-Number)

#### **Modified Starches**
- "Modified corn starch", "modified tapioca starch", "modified wheat starch"
- Used as thickeners, stabilizers
- **NOT the same as** "corn starch" or "tapioca starch" (unmodified is okay)

**Common in:** Sauces, soups, ready meals

#### **Hydrolyzed Proteins**
- "Hydrolyzed vegetable protein", "hydrolyzed soy protein"
- Used for flavor enhancement (similar to MSG)

**Common in:** Savory snacks, soups, processed meats

#### **Protein Isolates**
- "Soy protein isolate", "whey protein isolate", "pea protein isolate"
- Highly refined proteins

**Common in:** Protein bars, meat substitutes, processed meats

#### **Maltodextrin**
- Highly processed carbohydrate
- Used as filler, thickener, sweetener

**Common in:** Snacks, sauces, powdered drinks

#### **High-Fructose Corn Syrup (HFCS) / Glucose-Fructose Syrup**
- Industrial sweetener
- Cheaper than sugar, used widely in US/UK products

**Common in:** Soft drinks, desserts, breakfast cereals

#### **Invert Sugar / Invert Syrup**
- Industrial sweetener
- Prevents crystallization

**Common in:** Candies, baked goods

#### **Partially Hydrogenated Oils / Trans Fats**
- Industrial fats (mostly banned now, but still in some products)

**Common in:** Margarine, baked goods

#### **Reconstituted Ingredients**
- "Reconstituted meat", "reconstituted fruit juice"
- Disassembled and reassembled

**Common in:** Fruit juices, processed meats

### 3. Processing Terms

Presence of these terms often indicates ultra-processing:

- "Reconstituted"
- "Mechanically separated"
- "Extruded" (e.g., extruded snacks like Cheetos)
- "Pre-fried" / "Par-fried"

---

## Classification Pipeline

The extension uses a three-tier lookup to determine a product's NOVA score:

### Tier 1 — OFF v2 Barcode Lookup (Primary)

The content script extracts the product barcode (`gtin13`) from the page's JSON-LD data and sends a `FETCH_PRODUCT` message to the background service worker. The service worker queries `https://world.openfoodfacts.org/api/v2/product/{barcode}.json` and reads the NOVA score from `product.nova_group` (or `product.nova_groups_tags[0]` as a fallback).

If a valid NOVA score (1–4) is returned, it is displayed immediately. Classification reasons come from `product.nova_groups_markers`.

**Fresh produce exception:** If the product has no NOVA score but its `categories_tags` match known fresh produce categories (e.g. `en:fresh-vegetables`), the score is inferred as NOVA 1 automatically.

### Tier 2 — OFF v3 Ingredient Analysis (Secondary Fallback)

If the barcode lookup returns a product but no NOVA score (`source: 'no_nova'`), or the barcode is not found at all (`source: 'not_found'`), the content script sends the raw ingredient text to the service worker via `ANALYZE_INGREDIENTS`. The service worker forwards this to the OFF v3 stateless ingredient analysis endpoint.

### Tier 3 — Local Rule-Based Classifier (Final Fallback)

If both API tiers fail (network error, timeout, or no result), the content script runs the ingredients through the local classifier (`lib/nova-classifier.js` + `lib/nova-indicators.js`). See below.

---

## Local Rule-Based Classifier (Fallback Only)

**When used:** Both OFF API tiers have failed or returned no result.

**Input:** Array of ingredients (strings)

**Output:**
```javascript
{
  score: 1-4,           // NOVA score
  reason: "string",     // Human-readable explanation
  indicators: [],       // List of NOVA 4 indicators found
  confidence: 0-1       // Confidence level (0=low, 1=high) — local classifier only
}
```

> **Note:** The `confidence` field only applies to local classification output. OFF API results are trusted by their source (`'api'` or `'cache'`) rather than a confidence score.

### Algorithm Steps

```
1. Parse ingredient list into array
2. Clean and normalize each ingredient
3. Check for NOVA 4 indicators:
   a. E-numbers (matched against NOVA4_E_NUMBERS set in nova-indicators.js)
   b. Industrial ingredients (matched against NOVA4_ADDITIVE_PATTERNS regexes)
4. Count NOVA 4 indicators
5. Apply classification rules:
   - If ≥2 NOVA 4 indicators → NOVA 4 (confidence 0.9)
   - If 1 NOVA 4 indicator → NOVA 4 (confidence 0.7)
   - If 0 NOVA 4 indicators:
     - Processing markers present (fermented, smoked, cured, cultured, etc.) → NOVA 3
     - Contains added culinary ingredient (salt, sugar, oil, etc.) + ≥2 tokens → NOVA 3
     - ≤3 tokens, contains a culinary ingredient → NOVA 2
     - ≤3 tokens, no culinary ingredient → NOVA 1
     - Default (>3 tokens, no indicators) → NOVA 2
6. Return result with explanation
```

### Confidence Levels

Applies to local classifier output only.

| Confidence | Meaning |
|------------|---------|
| 0.9 | High (≥2 NOVA 4 indicators found) |
| 0.7 | Medium-High (1 clear NOVA 4 indicator) |
| 0.6 | Medium (NOVA 3 classification) |
| 0.5 | Lower (NOVA 1 or 2, ambiguous) |

---

## Edge Cases

### 1. Natural E-Numbers

**Problem:** Some E-numbers are natural (e.g., E300 = Vitamin C, E330 = Citric acid).

**Solution:**
- Maintain a whitelist of "acceptable" E-numbers
- Don't automatically flag all E-numbers
- Focus on clearly industrial ones (E621, E951, E407, etc.)

**Example:**
- "E300 (Ascorbic acid)" → NOT ultra-processed indicator
- "E621 (MSG)" → Ultra-processed indicator

### 2. Modified vs Unmodified Starches

**Problem:** "Corn starch" (natural) vs "Modified corn starch" (industrial).

**Solution:**
- Use regex to detect "modified" + "starch"
- Plain "starch" or "corn starch" → NOT ultra-processed

**Example:**
- "Corn starch" → NOVA 2-3
- "Modified corn starch" → NOVA 4

### 3. Ambiguous Ingredients

**Problem:** Some ingredients could be natural or industrial (e.g., "flavoring" could be vanilla extract or artificial).

**Solution:**
- "Natural flavoring" → NOT ultra-processed (unless in doubt)
- "Flavoring" or "Artificial flavoring" → Ultra-processed indicator

**Example:**
- "Natural vanilla flavoring" → Okay
- "Flavoring" → Ultra-processed indicator

### 4. Missing Ingredient Lists

**Problem:** Some products don't have ingredients listed (e.g., fresh produce, or site doesn't display them).

**Solution:**
- Return `null` or show "?" badge
- Don't guess

**Example:**
- Fresh apple (no ingredients) → Skip classification or show NOVA 1 (if product type is clearly fresh produce)

### 5. Multi-Language Ingredients

**Problem:** Ingredients in non-English languages.

**Solution (v1):**
- E-numbers are universal (E621 is E621 in any language)
- Focus on E-number detection
- For words, skip non-English (or use basic translation in v2)

**Future Enhancement:** Add multi-language support for common terms.

---

## Examples

### Example 1: Ultra-Processed (NOVA 4)

**Product:** Coca-Cola
**Ingredients:** "Carbonated Water, Sugar, Colour (Caramel E150d), Phosphoric Acid, Natural Flavourings including Caffeine"

**Analysis:**
- E150d (color) → NOVA 4 indicator
- "Phosphoric Acid" → NOVA 4 indicator (acidifier, E338)
- Multiple indicators → NOVA 4

**Classification:**
```javascript
{
  score: 4,
  reason: "Contains multiple ultra-processed ingredients (E150d, phosphoric acid)",
  indicators: ["E150d", "phosphoric acid"],
  confidence: 0.9
}
```

**Badge:** 🔴 NOVA 4

---

### Example 2: Processed (NOVA 3)

**Product:** Canned Tomatoes
**Ingredients:** "Tomatoes, Tomato Juice, Salt, Citric Acid"

**Analysis:**
- Citric Acid (E330) → Natural preservative, borderline
- Salt → Processing ingredient
- Only 4 ingredients, recognizable
- No clear ultra-processed indicators

**Classification:**
```javascript
{
  score: 3,
  reason: "Processed food with added salt and preservative",
  indicators: [],
  confidence: 0.6
}
```

**Badge:** 🟠 NOVA 3

---

### Example 3: Minimally Processed (NOVA 1)

**Product:** Plain Yogurt
**Ingredients:** "Milk, Live Yogurt Cultures"

**Analysis:**
- Only 2 ingredients
- Both natural (milk + cultures)
- No additives

**Classification:**
```javascript
{
  score: 1,
  reason: "Minimal ingredients, unprocessed",
  indicators: [],
  confidence: 0.8
}
```

**Badge:** 🟢 NOVA 1

---

### Example 4: Ultra-Processed (NOVA 4) - Complex

**Product:** Ready Meal (Chicken Tikka Masala)
**Ingredients:** "Water, Chicken (20%), Tomato Puree, Onion, Cream, Rapeseed Oil, Modified Maize Starch, Sugar, Spices, Salt, Garlic Puree, Ginger Puree, Emulsifier (E471), Stabiliser (E412), Colour (E160c)"

**Analysis:**
- Modified Maize Starch → NOVA 4 indicator
- E471 (emulsifier) → NOVA 4 indicator
- E412 (stabiliser) → NOVA 4 indicator
- E160c (color) → NOVA 4 indicator
- Multiple indicators → NOVA 4

**Classification:**
```javascript
{
  score: 4,
  reason: "Contains multiple ultra-processed ingredients (modified starch, E471, E412, E160c)",
  indicators: ["modified maize starch", "E471", "E412", "E160c"],
  confidence: 0.95
}
```

**Badge:** 🔴 NOVA 4

---

## Sources & References

### Official NOVA Resources
- **Original NOVA Paper:** Monteiro et al. (2016) - "NOVA. The star shines bright" - World Nutrition
- **FAO Guidelines:** http://www.fao.org/nutrition/education/food-based-dietary-guidelines
- **OpenFoodFacts NOVA Methodology:** https://world.openfoodfacts.org/nova

### E-Number References
- **UK Food Standards Agency:** https://www.food.gov.uk/
- **E-Number Database:** https://www.food-info.net/uk/e/

### Research on Ultra-Processed Foods
- Monteiro et al. (2018) - "Ultra-processed foods: what they are and how to identify them"
- Hall et al. (2019) - NIH study on ultra-processed foods and weight gain
- Pagliai et al. (2021) - "Consumption of ultra-processed foods and health status"

### Our Implementation
- Based on OpenFoodFacts classification methodology
- Aggressive approach: prioritize avoiding false negatives for NOVA 4 (per CLAUDE.md)
- Prioritize transparency (show why product classified as NOVA 4)

---

*End of CLASSIFICATION_LOGIC.md*
