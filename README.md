# Visual Vocabulary for ThoughtSpot

A collection of **50+ custom chart types built in ThoughtSpot Muze Studio**, organized by analytical purpose to help users explore different ways to visualize and understand data.

Inspired by the [Financial Times' Visual Vocabulary](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary), [Andy Kriebel's Tableau Visual Vocabulary](https://public.tableau.com/views/VisualVocabulary/VisualVocabulary), and [Bibek Shrestha's ThoughtSpot custom chart showcase](https://community.thoughtspot.com/s/feed/0D5TV00001BJ5j3?).

## Overview

The Visual Vocabulary is organized into nine categories:

| Category | Purpose |
|---|---|
| Deviation | Show how values differ from a reference, target, or average. |
| Correlation | Explore relationships between two or more variables. |
| Ranking | Compare the relative position of categories or items. |
| Distribution | Understand frequencies, spread, clusters, and outliers. |
| Change over Time | Show how values or patterns evolve over time. |
| Part-to-Whole | Show how individual components contribute to a total. |
| Magnitude | Compare the size of quantitative values. |
| Spatial | Explore geographic patterns, locations, and concentrations. |
| Flow | Illustrate movement, transitions, and connections. |

Each category includes **Standard and Advanced visualizations**, with descriptions explaining how and when each chart type can be used.

## Preview

![Visual Vocabulary for ThoughtSpot Overview](images/overview.png)

A PDF export of the complete Liveboard is also available: [View Visual Vocabulary](Visual_Vocabulary_for_ThoughtSpot.pdf).

## Getting Started

The project was developed using ThoughtSpot Muze Studio and the **(Sample) Retail - Apparel** data model.

To explore the Liveboard in your own ThoughtSpot environment:

1. Download the Liveboard TML file from this repository.
2. Open ThoughtSpot and import the TML.
3. Ensure the required data model and fields are available.
4. Review the imported Answers and custom chart configurations.
5. Adjust any data model references, formulas, or chart dependencies as needed.

**Note:** The TML was built against a specific Sample Retail – Apparel environment. Importing into another ThoughtSpot instance may require adjustments, and compatibility has not been verified across all environments.

## Chart Implementation

All visualizations were developed within Muze Studio.

- **Native Muze charts:** Most use Muze marks and retain ThoughtSpot filtering and drill down capabilities.
- **Custom SVG charts:** Some advanced visualizations use D3, SVG, or other rendering approaches. These may not support native ThoughtSpot filtering and drill down.
- **Formatting:** Charts use consistent category colors, numeric formatting, tooltips, and legends where applicable.

The examples are intended as a visualization reference and starting point for further customization.

## References and Inspiration

- [Financial Times — Visual Vocabulary](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary)
- [Andy Kriebel — Visual Vocabulary for Tableau](https://public.tableau.com/views/VisualVocabulary/VisualVocabulary)
- [Bibek Shrestha — ThoughtSpot Custom Chart Showcase](https://community.thoughtspot.com/s/feed/0D5TV00001BJ5j3?)

The Visual Vocabulary concept originated with the Financial Times and was adapted for other visualization platforms. This project explores how those ideas can be implemented in ThoughtSpot.

## AI Assistance

Muze AI and ChatGPT were used to assist with custom chart development, formatting, and the Overview page.

## Feedback

Feedback, suggestions, and ideas for improving or expanding the chart collection are welcome.