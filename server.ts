import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Parse JSON bodies
  app.use(express.json());

  // Proxy route for Fibre2Fashion API to handle CORS and API integration safely
  app.post("/api/fetch-rm-prices", async (req, res) => {
    try {
      const { productIds, startDate, endDate, currency, unit, token } = req.body;

      if (!token) {
        return res.status(400).json({ error: "API Bearer Token is required." });
      }

      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: "At least one material must be selected." });
      }

      // Build payload matching exact specifications of the Fibre2Fashion TexPro API
      const payload = {
        ProductIds: productIds,
        StartDate: startDate,
        EndDate: endDate,
        Currency: currency || "USD",
        Unit: unit || "KG"
      };

      console.log("Proxying request to Fibre2Fashion API with payload:", payload);

      const response = await fetch("https://api.fibre2fashion.com/mi/api/miapi/GetRMHistoricalDetail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Fibre2Fashion API HTTP Error:", response.status, errorText);
        return res.status(response.status).json({
          error: `API returned error status ${response.status}`,
          details: errorText
        });
      }

      const data = await response.json();
      console.log("Fibre2Fashion API responded successfully.");
      return res.json(data);
    } catch (err: any) {
      console.error("Error communicating with Fibre2Fashion API:", err);
      return res.status(500).json({ 
        error: "Failed to communicate with Fibre2Fashion API.", 
        details: err.message 
      });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
