/**
 * Available Columns:
 * "region"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

(() => {
  const root = document.querySelector("#chart");

  const categories = [
    {
      name: "Deviation",
      color: "#E6B00E",
      description: "Show how values differ from a reference, target, or average."
    },
    {
      name: "Correlation",
      color: "#4E91B5",
      description: "Explore relationships between two or more variables."
    },
    {
      name: "Ranking",
      color: "#568F83",
      description: "Compare the relative position of categories or items."
    },
    {
      name: "Distribution",
      color: "#C18456",
      description: "Understand frequencies, spread, clusters, and outliers."
    },
    {
      name: "Change over Time",
      color: "#558DA5",
      description: "Show how values or patterns evolve over time."
    },
    {
      name: "Part-to-Whole",
      color: "#BC819C",
      description: "Show how individual components contribute to a total."
    },
    {
      name: "Magnitude",
      color: "#A2468C",
      description: "Compare the size of quantitative values."
    },
    {
      name: "Spatial",
      color: "#9C9D94",
      description: "Explore geographic patterns, locations, and concentrations."
    },
    {
      name: "Flow",
      color: "#AABD67",
      description: "Illustrate movement, transitions, and connections."
    }
  ];

  const style = document.createElement("style");
  style.textContent = `
    #visual-vocabulary {
      font-family: Arial, sans-serif;
      color: #252B32;
      background: #F7F8F9;
      padding: 32px;
      box-sizing: border-box;
      width: 100%;
      min-height: 100%;
    }

    #visual-vocabulary * {
      box-sizing: border-box;
    }

    #visual-vocabulary .vv-content {
      max-width: 1400px;
      margin: 0 auto;
    }

    #visual-vocabulary .vv-heading {
      margin-bottom: 30px;
    }

    #visual-vocabulary h1 {
      font-size: clamp(32px, 4vw, 52px);
      font-weight: 700;
      letter-spacing: -1.5px;
      margin: 0 0 8px;
      line-height: 1.15;
    }

    #visual-vocabulary .vv-subtitle {
      font-size: 19px;
      font-style: italic;
      color: #56616C;
      margin: 0 0 24px;
    }

    #visual-vocabulary .vv-intro {
      max-width: 1000px;
      font-size: 14px;
      line-height: 1.7;
      color: #56616C;
    }

    #visual-vocabulary .vv-intro p {
      margin: 0 0 12px;
    }

    #visual-vocabulary .vv-note {
      margin-top: 18px;
      padding: 12px 16px;
      background: #FFFFFF;
      border-left: 3px solid #A2468C;
      border-radius: 0 6px 6px 0;
      font-size: 13px;
      line-height: 1.6;
    }

    #visual-vocabulary .vv-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin-top: 32px;
    }

    #visual-vocabulary .vv-card {
      background: #FFFFFF;
      border: 1px solid #E1E5E8;
      border-top: 5px solid var(--category-color);
      border-radius: 10px;
      padding: 23px;
      min-height: 150px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    #visual-vocabulary .vv-card h2 {
      font-size: 21px;
      font-weight: 700;
      margin: 0 0 12px;
      line-height: 1.25;
    }

    #visual-vocabulary .vv-card p {
      font-size: 13px;
      line-height: 1.6;
      color: #68747E;
      margin: 0;
    }

    #visual-vocabulary .vv-footer {
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #E1E5E8;
      color: #89939B;
      font-size: 11px;
      line-height: 1.7;
    }

    #visual-vocabulary a {
      color: #526D88;
      text-decoration: underline;
    }

    @media (max-width: 900px) {
      #visual-vocabulary .vv-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 600px) {
      #visual-vocabulary {
        padding: 18px;
      }

      #visual-vocabulary .vv-grid {
        grid-template-columns: 1fr;
      }

      #visual-vocabulary .vv-card {
        min-height: 120px;
      }
    }
  `;

  document.getElementById("vv-category-styles")?.remove();
  style.id = "vv-category-styles";
  document.head.appendChild(style);

  root.innerHTML = `
    <div id="visual-vocabulary">
      <div class="vv-content">

        <div class="vv-heading">
          <h1>Visual Vocabulary</h1>
          <p class="vv-subtitle">
            A guide to chart types in ThoughtSpot.
          </p>
        </div>

        <div class="vv-intro">
          <p>
            This Liveboard is inspired by the Financial Times'
            Visual Vocabulary, adapted and reimagined for
            ThoughtSpot. Not every chart from the original
            made it in. Some shifted categories, and a few
            are entirely new.
          </p>

          <p>
            Browse by analytical purpose to find the right
            chart for your data story: comparisons,
            distributions, relationships, flows, and more.
          </p>

          <p>
            All charts are built in Muze Studio. Most visualizations use native Muze marks and support ThoughtSpot filtering and drill down. Select charts use custom SVG or other rendering approaches and may not support those native interactions.
          </p>

          <p>
            Note: AI tools, including Muze AI and ChatGPT, were used to assist with custom chart formatting and this Overview page.
          </p>
        </div>

        <div class="vv-grid">
          ${categories.map(category => `
            <div class="vv-card"
                 style="--category-color:${category.color}">
              <h2>${category.name}</h2>
              <p>${category.description}</p>
            </div>
          `).join("")}
        </div>

<div class="vv-footer">
  Based on the
  <a href="https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary" target="_blank" rel="noopener noreferrer">FT Visual Vocabulary</a>
  by Alan Smith, Chris Campbell, Ian Bott,
  Liz Faunce, Graham Parrish, Billy Ehrenberg,
  Paul McCallum, and Martin Stabe.
  Inspired by the Graphic Continuum by
  Jon Schwabish and Severino Ribecca.

  <div style="margin-top: 6px;">
    Additional inspiration from Andy Kriebel's Tableau
    adaptation of
    <a href="https://public.tableau.com/views/VisualVocabulary/VisualVocabulary?:language=en-US&amp;:sid=&amp;:redirect=auth&amp;:display_count=n&amp;:origin=viz_share_link" target="_blank" rel="noopener noreferrer">Visual Vocabulary</a>
    on Tableau Public.
  </div>
</div>
  `;

  viz.events?.emitRenderCompletedEvent?.();
})();