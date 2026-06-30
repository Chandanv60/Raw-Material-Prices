import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from "recharts";
import { 
  Layers, 
  Calendar, 
  Key, 
  Download, 
  RefreshCw, 
  Copy, 
  Check, 
  Info, 
  AlertTriangle, 
  Terminal, 
  Database,
  Code,
  Sparkles,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet,
  Upload,
  Trash2,
  Plus,
  Calculator,
  Percent
} from "lucide-react";

// ==========================================
// 1. MATERIAL ID MAPPING
// REPLACE THESE PLACEHOLDER PRODUCT IDS WITH THE PROPRIETARY VENDOR IDS
// RECEIVED FROM YOUR FIBRE2FASHION TEXPRO VENDOR INTEGRATION TEAM.
// ==========================================
const MATERIAL_MAPPING: Record<string, { id: number; color: string; basePrice: number; description: string }> = {
  "ZMAC": { id: 103, color: "#3b82f6", basePrice: 1.55, description: "Zamac alloy casting material" },
  "PU": { id: 104, color: "#10b981", basePrice: 3.25, description: "Polyurethane elastomer compounds" },
  "Rubber": { id: 105, color: "#8b5cf6", basePrice: 2.80, description: "Natural & vulcanized rubber grade A" },
  "Cotton": { id: 101, color: "#f59e0b", basePrice: 2.15, description: "Standard carded cotton fiber raw" },
  "Spandex": { id: 102, color: "#ec4899", basePrice: 4.85, description: "High elasticity polyurethane fibers" },
  "RPES": { id: 106, color: "#f43f5e", basePrice: 1.95, description: "Recycled Polyester Staple fiber" },
  "PES": { id: 107, color: "#06b6d4", basePrice: 1.75, description: "Virgin polyester staple fiber" },
  "Paper": { id: 108, color: "#78350f", basePrice: 0.85, description: "Heavy packaging craft paper grade" },
  "PP": { id: 109, color: "#6b7280", basePrice: 1.20, description: "Polypropylene raw polymer chips" }
};

const EXCHANGE_RATE_USD_TO_INR = 83.50;

export default function App() {
  // Calculate default date range (last 6 months)
  const defaultEndDate = useMemo(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  }, []);

  const defaultStartDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split("T")[0];
  }, []);

  // UI state
  const [activeTab, setActiveTab] = useState<"dashboard" | "estimator" | "code">("dashboard");
  const [currency, setCurrency] = useState<"USD" | "INR">("INR");
  const [bearerToken, setBearerToken] = useState("");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>(["Cotton", "Spandex", "PP"]);
  const [useSimulation, setUseSimulation] = useState(true);
  const [showToken, setShowToken] = useState(false);

  // Product Composition Cost Estimator state
  const [productName, setProductName] = useState("Eco-Blend Premium Knitwear");
  const [productWeight, setProductWeight] = useState(250); // grams
  const [composition, setComposition] = useState<{ materialName: string; percentage: number }[]>([
    { materialName: "Cotton", percentage: 70 },
    { materialName: "Spandex", percentage: 30 }
  ]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data states
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [rawApiResponse, setRawApiResponse] = useState<any>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Trigger data load on mount with default simulation
  useEffect(() => {
    handleFetchData();
  }, []);

  // Handler for material checklist
  const toggleMaterial = (material: string) => {
    setSelectedMaterials((prev) =>
      prev.includes(material)
        ? prev.filter((item) => item !== material)
        : [...prev, material]
    );
  };

  // Helper: generates random walk mock prices for selected materials over date range
  const generateMockPrices = (materials: string[], startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const dataList: any[] = [];
    const tempPrices: Record<string, number> = {};

    // Initialize base prices
    materials.forEach((m) => {
      tempPrices[m] = MATERIAL_MAPPING[m]?.basePrice || 2.0;
    });

    const curr = new Date(start);
    while (curr <= end) {
      const dateStr = curr.toISOString().split("T")[0];
      const dataRow: any = { date: dateStr };

      materials.forEach((m) => {
        // Daily variation (-1.2% to +1.4% with minor upward drift over time)
        const dailyDrift = 0.0005; // upward tendency
        const randomFluctuation = (Math.random() - 0.47) * 0.025; 
        const nextPrice = tempPrices[m] * (1 + randomFluctuation + dailyDrift);
        tempPrices[m] = Math.max(0.1, nextPrice); // floor price
        dataRow[m] = parseFloat(tempPrices[m].toFixed(2));
      });

      dataList.push(dataRow);
      // Advance by 1 day
      curr.setDate(curr.getDate() + 1);
    }
    return dataList;
  };

  // Safe transformer for real API response (maps narrow response lists to wide chart lists)
  const parseNarrowApiResponse = (apiRows: any[], targetMaterials: string[]) => {
    const tempMap: Record<string, any> = {};

    apiRows.forEach((row) => {
      const rawDate = row.Date || row.date || row.DateString || row.datestring;
      if (!rawDate) return;
      const formattedDate = new Date(rawDate).toISOString().split("T")[0];

      let matchedName = row.ProductName || row.productname || row.ProductNameString || "";
      if (!matchedName && row.ProductId) {
        // Map back ID to name
        matchedName = Object.keys(MATERIAL_MAPPING).find(
          (key) => MATERIAL_MAPPING[key].id === row.ProductId
        ) || "";
      }

      if (!matchedName || !targetMaterials.includes(matchedName)) return;

      const priceValue = parseFloat(row.Price || row.price || row.Rate || row.rate || 0);

      if (!tempMap[formattedDate]) {
        tempMap[formattedDate] = { date: formattedDate };
      }
      tempMap[formattedDate][matchedName] = priceValue;
    });

    return Object.values(tempMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
  };

  // Core fetch execution
  const handleFetchData = async () => {
    if (selectedMaterials.length === 0) {
      setApiError("Please select at least one material to fetch.");
      setChartData([]);
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      setApiError("Start Date cannot be after End Date.");
      setChartData([]);
      return;
    }

    setLoading(true);
    setApiError(null);
    setRawApiResponse(null);

    // Simulation Mode Logic
    if (useSimulation) {
      setTimeout(() => {
        try {
          const simulated = generateMockPrices(selectedMaterials, startDate, endDate);
          setChartData(simulated);
        } catch (err: any) {
          setApiError(`Failed to generate simulated pricing: ${err.message}`);
        } finally {
          setLoading(false);
        }
      }, 700);
      return;
    }

    // Live API Mode Logic
    if (!bearerToken) {
      setApiError("API Bearer Token is required for Live Mode. Please enter your token or enable Simulation Mode.");
      setLoading(false);
      return;
    }

    try {
      const productIds = selectedMaterials.map((name) => MATERIAL_MAPPING[name].id);
      
      const res = await fetch("/api/fetch-rm-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds,
          startDate,
          endDate,
          currency,
          unit: "KG",
          token: bearerToken
        })
      });

      const responseBody = await res.json();
      setRawApiResponse(responseBody);

      if (!res.ok) {
        throw new Error(responseBody.error || `HTTP ${res.status} returned by API proxy.`);
      }

      // Check if data is inside the expected array structure
      const fetchedList = responseBody.Data || responseBody.data || responseBody;
      if (Array.isArray(fetchedList) && fetchedList.length > 0) {
        const transformed = parseNarrowApiResponse(fetchedList, selectedMaterials);
        setChartData(transformed);
      } else if (responseBody.Status === "Error" || responseBody.status === "error") {
        throw new Error(responseBody.Message || responseBody.message || "Fibre2Fashion TexPro API error response.");
      } else {
        // Fallback or empty warning
        setApiError("API executed but returned empty historical pricing array. Defaulting to Simulation Mode graphs.");
        const simulated = generateMockPrices(selectedMaterials, startDate, endDate);
        setChartData(simulated);
      }

    } catch (err: any) {
      console.error(err);
      setApiError(`Fibre2Fashion API Error: ${err.message || "Unknown error occurring during connection."}`);
    } finally {
      setLoading(false);
    }
  };

  // Stats summary calculation (Average, Min, Max, Trend %)
  // Dynamically translate chart prices in Simulation mode if currency is INR
  const displayChartData = useMemo(() => {
    if (!chartData) return [];
    if (useSimulation && currency === "INR") {
      return chartData.map((row) => {
        const newRow = { ...row };
        Object.keys(MATERIAL_MAPPING).forEach((mat) => {
          if (typeof newRow[mat] === "number") {
            newRow[mat] = parseFloat((newRow[mat] * EXCHANGE_RATE_USD_TO_INR).toFixed(2));
          }
        });
        return newRow;
      });
    }
    return chartData;
  }, [chartData, currency, useSimulation]);

  // Helper to format currency values beautifully
  const formatPriceValue = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return "-";
    if (currency === "INR") {
      return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${val.toFixed(2)}`;
  };

  const activeStats = useMemo(() => {
    if (!displayChartData || displayChartData.length === 0) return {};
    
    const stats: Record<string, { min: number; max: number; avg: number; change: number }> = {};
    
    selectedMaterials.forEach((mat) => {
      const prices = displayChartData
        .map((row) => row[mat])
        .filter((val) => typeof val === "number" && !isNaN(val));

      if (prices.length > 0) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const sum = prices.reduce((a, b) => a + b, 0);
        const avg = sum / prices.length;
        
        // Percent change from start to end of interval
        const startVal = prices[0];
        const endVal = prices[prices.length - 1];
        const change = startVal !== 0 ? ((endVal - startVal) / startVal) * 100 : 0;

        stats[mat] = {
          min: parseFloat(min.toFixed(2)),
          max: parseFloat(max.toFixed(2)),
          avg: parseFloat(avg.toFixed(2)),
          change: parseFloat(change.toFixed(1))
        };
      }
    });
    
    return stats;
  }, [displayChartData, selectedMaterials]);

  // Export Data to CSV function
  const handleExportCSV = () => {
    if (chartData.length === 0) return;

    // Create header: Date, Mat1, Mat2...
    const headers = ["Date", ...selectedMaterials];
    const csvRows = [headers.join(",")];

    chartData.forEach((row) => {
      const values = [
        row.date,
        ...selectedMaterials.map((mat) => row[mat] ?? "")
      ];
      csvRows.push(values.join(","));
    });

    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `Fibre2Fashion_RM_Prices_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };  // Python Code Text for Tab 2
  const streamlitPythonCode = `"""
Fibre2Fashion TexPro RM Historical Pricing & BOM Cost Estimator
Optimized for embedding directly inside Google Sites via standard iframe layouts or hosted on Render.

Required packages:
pip install streamlit requests pandas plotly
"""

import streamlit as st
import requests
import pandas as pd
import plotly.express as px
from datetime import datetime, timedelta
import json
import math

# 1. UI & EMBEDDING OPTIMIZATION
st.set_page_config(
    page_title="Fibre2Fashion RM Dashboard",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Inject custom CSS to make it completely borderless and native inside Google Sites
st.markdown("""
    <style>
    .block-container {
        padding-top: 1.5rem !important;
        padding-bottom: 1.5rem !important;
        padding-left: 2rem !important;
        padding-right: 2rem !important;
    }
    header { visibility: hidden; }
    footer { visibility: hidden; }
    </style>
""", unsafe_allow_html=True)

st.title("📊 Raw Material Pricing & BOM Estimator")
st.caption("Historical price trends and product raw material cost calculator pulled from Fibre2Fashion TexPro API")

# 2. MATERIAL ID MAPPING
MATERIAL_MAPPING = {
    "ZMAC": {"id": 103, "color": "#3b82f6", "basePrice": 3.45},
    "PU": {"id": 104, "color": "#10b981", "basePrice": 2.10},
    "Rubber": {"id": 105, "color": "#f59e0b", "basePrice": 1.75},
    "Cotton": {"id": 101, "color": "#8b5cf6", "basePrice": 2.25},
    "Spandex": {"id": 102, "color": "#ec4899", "basePrice": 4.80},
    "RPES": {"id": 106, "color": "#06b6d4", "basePrice": 1.95},
    "PES": {"id": 107, "color": "#3b82f6", "basePrice": 1.45},
    "Paper": {"id": 108, "color": "#a855f7", "basePrice": 0.85},
    "PP": {"id": 109, "color": "#6b7280", "basePrice": 1.20}
}

EXCHANGE_RATE_USD_TO_INR = 83.50

# 3. SIDEBAR CONFIGURATION
st.sidebar.title("Configuration")
st.sidebar.markdown("Provide API tokens & query parameters:")

# Bearer Token
api_token = st.sidebar.text_input(
    "Fibre2Fashion Bearer Token",
    type="password",
    help="Enter your vendor Authorization Bearer token key."
)

# Currency Selector
currency = st.sidebar.radio(
    "Pricing Currency",
    options=["USD", "INR"],
    index=1,
    help="Select the display and estimation currency."
)

# Simulation Mode Toggle
use_simulation = st.sidebar.checkbox(
    "Enable Sandbox Simulation Mode",
    value=True,
    help="Toggle simulation to use historical/fallback indices."
)

# Date Picker Range
six_months_ago = datetime.today() - timedelta(days=180)
start_date = st.sidebar.date_input("Start Date", six_months_ago)
end_date = st.sidebar.date_input("End Date", datetime.today())

# Main Tabs: Dashboard & BOM Estimator
tab_dashboard, tab_estimator = st.tabs(["📈 Price Trends Dashboard", "🧮 BOM Cost Estimator"])

# --- DATA RETRIEVAL FUNCTION ---
@st.cache_data(show_spinner=False)
def fetch_raw_material_data(product_ids, start_str, end_str, token, simulation):
    if simulation:
        # Generate clean sandbox simulated historical rows
        dates = pd.date_range(start=start_str, end=end_str, freq="W")
        rows = []
        for d in dates:
            for pid in product_ids:
                # Find matching material key to calculate mock pricing
                mat_key = next((k for k, v in MATERIAL_MAPPING.items() if v["id"] == pid), "Cotton")
                base = MATERIAL_MAPPING[mat_key]["basePrice"]
                # Create synthetic waving trend
                wave = math.sin(d.to_pydatetime().timestamp() / 1500000) * 0.15
                price = base * (1 + wave)
                rows.append({
                    "date": d,
                    "ProductId": pid,
                    "Price": round(price, 2)
                })
        return pd.DataFrame(rows)
    else:
        # Live Fibre2Fashion API Call
        url = "https://api.fibre2fashion.com/mi/api/miapi/GetRMHistoricalDetail"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {
            "ProductIds": product_ids,
            "StartDate": start_str,
            "EndDate": end_str,
            "Currency": "USD",
            "Unit": "KG"
        }
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            data = response.json().get("Data", []) or response.json().get("data", [])
            if not data and isinstance(response.json(), list):
                data = response.json()
            if data:
                df = pd.DataFrame(data)
                if "Date" in df.columns:
                    df["date"] = pd.to_datetime(df["Date"])
                elif "date" in df.columns:
                    df["date"] = pd.to_datetime(df["date"])
                return df
        return pd.DataFrame()

# Fetch active list of ids for visualization/caching
all_ids = [v["id"] for v in MATERIAL_MAPPING.values()]

df_raw = pd.DataFrame()
if api_token or use_simulation:
    df_raw = fetch_raw_material_data(
        all_ids, 
        start_date.strftime("%Y-%m-%d"), 
        end_date.strftime("%Y-%m-%d"), 
        api_token, 
        use_simulation
    )

# Helper to map ProductIds to names
id_to_name = {v["id"]: k for k, v in MATERIAL_MAPPING.items()}
if not df_raw.empty:
    if "ProductId" in df_raw.columns:
        df_raw["ProductName"] = df_raw["ProductId"].map(id_to_name)
    elif "product_id" in df_raw.columns:
        df_raw["ProductName"] = df_raw["product_id"].map(id_to_name)
    
    # Currency conversions
    if currency == "INR":
        rate = EXCHANGE_RATE_USD_TO_INR
        if "Price" in df_raw.columns:
            df_raw["Price"] = (df_raw["Price"] * rate).round(2)
        elif "price" in df_raw.columns:
            df_raw["price"] = (df_raw["price"] * rate).round(2)

# Get latest price helper for the estimator
def get_latest_price_py(material_name):
    if not df_raw.empty:
        col = "Price" if "Price" in df_raw.columns else ("price" if "price" in df_raw.columns else None)
        name_col = "ProductName" if "ProductName" in df_raw.columns else "product_name"
        if col and name_col in df_raw.columns:
            filtered = df_raw[df_raw[name_col] == material_name]
            if not filtered.empty:
                # Get the latest row by date
                latest_row = filtered.sort_values(by="date").iloc[-1]
                return float(latest_row[col])
    # Fallback to basePrice
    base = MATERIAL_MAPPING[material_name]["basePrice"]
    if currency == "INR":
        return base * EXCHANGE_RATE_USD_TO_INR
    return base

# --- TAB 1: DASHBOARD ---
with tab_dashboard:
    st.subheader("📊 Raw Material Pricing Trends")
    selected_materials = st.multiselect(
        "Select Materials to Analyze",
        options=list(MATERIAL_MAPPING.keys()),
        default=["Cotton", "Spandex"]
    )
    
    if not df_raw.empty:
        # Filter for selected materials
        name_col = "ProductName" if "ProductName" in df_raw.columns else "product_name"
        df_filtered = df_raw[df_raw[name_col].isin(selected_materials)] if name_col in df_raw.columns else df_raw
        
        if not df_filtered.empty:
            # Stats columns
            stats_cols = st.columns(len(selected_materials))
            for i, mat in enumerate(selected_materials):
                mat_df = df_filtered[df_filtered[name_col] == mat] if name_col in df_filtered.columns else pd.DataFrame()
                if not mat_df.empty:
                    val_col = "Price" if "Price" in df_filtered.columns else "price"
                    prices = mat_df[val_col].dropna().tolist()
                    if prices:
                        avg_p = sum(prices) / len(prices)
                        min_p = min(prices)
                        max_p = max(prices)
                        change_p = ((prices[-1] - prices[0]) / prices[0] * 100) if prices[0] != 0 else 0
                        
                        symbol = "₹" if currency == "INR" else "$"
                        with stats_cols[i]:
                            st.metric(
                                label=f"{mat} (Avg Index)",
                                value=f"{symbol}{avg_p:.2f}",
                                delta=f"{change_p:.1f}% Change"
                            )
                            st.caption(f"Min: {symbol}{min_p:.2f} | Max: {symbol}{max_p:.2f}")

            # Plotly Chart
            y_col = "Price" if "Price" in df_filtered.columns else "price"
            fig = px.line(
                df_filtered,
                x="date",
                y=y_col,
                color=name_col,
                markers=True,
                title="Fibre2Fashion Price Tracking Indices",
                template="plotly_white"
            )
            fig.update_layout(
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="rgba(0,0,0,0)",
                xaxis_title="Calendar Date",
                yaxis_title=f"Price ({currency}/KG)",
                legend_title="Raw Materials"
            )
            st.plotly_chart(fig, use_container_width=True)
            
            # Tabular Output
            st.write("### Tabular Pricing Ledger")
            st.dataframe(df_filtered, use_container_width=True)
        else:
            st.info("No matching price details returned for the selected items.")
    else:
        st.warning("⚠️ Enter your Bearer Token or toggle Simulation in the Sidebar to download price index arrays.")

# --- TAB 2: BOM COST ESTIMATOR ---
with tab_estimator:
    st.subheader("🧮 Product Composition & BOM Cost Calculator")
    st.markdown("Upload your raw material composition or enter percentages manually to fetch real TexPro costs.")
    
    # Product Meta Fields
    col_meta1, col_meta2 = st.columns([2, 1])
    with col_meta1:
        prod_name = st.text_input("Article Name", value="Eco-Blend Premium Knitwear")
    with col_meta2:
        prod_weight = st.number_input("Finished Weight per Piece (Grams)", min_value=1, value=250, step=5)
    
    # CSV / JSON File Uploader
    bom_file = st.file_uploader(
        "Upload Bill of Materials (CSV/JSON)", 
        type=["csv", "json"],
        help="Upload CSV with: Material,Percentage or JSON composition."
    )
    
    # Hold the current ingredients
    parsed_composition = []
    if bom_file is not None:
        try:
            if bom_file.name.endswith(".json"):
                data = json.load(bom_file)
                items = data if isinstance(data, list) else (data.get("composition", []) or data.get("BOM", []) or data.get("materials", []))
                for item in items:
                    raw_mat = item.get("material") or item.get("materialName") or item.get("name") or ""
                    raw_pct = float(item.get("percentage") or item.get("percent") or item.get("weightage") or item.get("value") or 0)
                    matched_key = next((k for k in MATERIAL_MAPPING.keys() if k.lower() == str(raw_mat).strip().lower()), None)
                    if matched_key and raw_pct > 0:
                        parsed_composition.append({"material": matched_key, "percentage": raw_pct})
            else:
                df_uploaded = pd.read_csv(bom_file)
                if len(df_uploaded.columns) >= 2:
                    for idx, row in df_uploaded.iterrows():
                        raw_mat = str(row.iloc[0]).strip()
                        raw_pct = float(row.iloc[1])
                        matched_key = next((k for k in MATERIAL_MAPPING.keys() if k.lower() == raw_mat.lower()), None)
                        if matched_key and raw_pct > 0:
                            parsed_composition.append({"material": matched_key, "percentage": raw_pct})
            st.success(f"Successfully parsed {len(parsed_composition)} ingredients from {bom_file.name}!")
        except Exception as e:
            st.error(f"Error reading file: {str(e)}")
            
    # Interactive Table Form
    st.write("#### 🧵 Adjust Material Percentages")
    
    # Base defaults if not loaded from file
    if not parsed_composition:
        default_comp = [
            {"material": "Cotton", "percentage": 70.0},
            {"material": "Spandex", "percentage": 30.0}
        ]
    else:
        default_comp = parsed_composition
        
    num_items = st.number_input("Number of materials", min_value=1, max_value=len(MATERIAL_MAPPING), value=len(default_comp))
    
    comp_inputs = []
    col_headers = st.columns([3, 3, 2])
    with col_headers[0]:
        st.markdown("**Material Fiber**")
    with col_headers[1]:
        st.markdown("**Weightage (%)**")
    with col_headers[2]:
        st.markdown("**TexPro Rate (per KG)**")
        
    total_pct = 0.0
    for idx in range(num_items):
        item_col = st.columns([3, 3, 2])
        default_material = default_comp[idx]["material"] if idx < len(default_comp) else list(MATERIAL_MAPPING.keys())[idx % len(MATERIAL_MAPPING)]
        default_percentage = default_comp[idx]["percentage"] if idx < len(default_comp) else 10.0
        
        with item_col[0]:
            sel_mat = st.selectbox(
                f"Material #{idx + 1}",
                options=list(MATERIAL_MAPPING.keys()),
                index=list(MATERIAL_MAPPING.keys()).index(default_material),
                key=f"mat_sel_{idx}"
            )
        with item_col[1]:
            sel_pct = st.slider(
                f"Weightage for #{idx + 1}",
                min_value=0.0,
                max_value=100.0,
                value=float(default_percentage),
                step=1.0,
                label_visibility="collapsed",
                key=f"mat_pct_{idx}"
            )
        
        latest_price = get_latest_price_py(sel_mat)
        symbol = "₹" if currency == "INR" else "$"
        with item_col[2]:
            st.markdown(f"**{symbol}{latest_price:.2f}**")
            
        comp_inputs.append({"material": sel_mat, "percentage": sel_pct, "rate": latest_price})
        total_pct += sel_pct

    # Warning alert if not balanced
    if round(total_pct, 1) != 100.0:
        st.warning(f"⚠️ Your active composition sums to **{total_pct:.1f}%**. For realistic article costing, please balance ingredients to **100%**.")

    # Final cost computation
    total_cost = 0.0
    weight_kg = prod_weight / 1000.0
    symbol = "₹" if currency == "INR" else "$"
    
    st.markdown("---")
    col_out1, col_out2 = st.columns([2, 1])
    
    with col_out1:
        st.write("### Cost Contribution Analysis")
        breakdown_rows = []
        for item in comp_inputs:
            item_weight_kg = (item["percentage"] / 100.0) * weight_kg
            item_cost = item_weight_kg * item["rate"]
            total_cost += item_cost
            breakdown_rows.append({
                "Material": item["material"],
                "Weight %": f"{item['percentage']}%",
                "Weight (g)": f"{item_weight_kg * 1000:.1f}g",
                "Rate": f"{symbol}{item['rate']:.2f}/KG",
                "RM Cost Contribution": f"{symbol}{item_cost:.2f}"
            })
        st.table(pd.DataFrame(breakdown_rows))
        
    with col_out2:
        st.markdown(
            f"""
            <div style="background-color:#1e293b; color:#ffffff; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
                <p style="text-transform: uppercase; font-size: 10px; font-weight: bold; color: #60a5fa; margin: 0;">Total Raw Material Cost</p>
                <h1 style="font-size: 36px; font-weight: 900; margin: 5px 0; font-family: monospace;">{symbol}{total_cost:.2f}</h1>
                <p style="font-size: 11px; color: #94a3b8; margin: 0 0 15px 0;">*Calculated per piece ({prod_weight}g total weight)</p>
                <div style="border-top: 1px solid #334155; padding-top: 10px; font-size: 12px; font-family: monospace;">
                    <div><b>Weighted Avg Rate:</b> {symbol}{(total_cost / weight_kg) if weight_kg > 0 else 0:.2f}/KG</div>
                    <div><b>Total Weight Yield:</b> {weight_kg:.3f} KG</div>
                </div>
            </div>
            """, 
            unsafe_allow_html=True
        )
""";to populate the visualizer.")
`;

  const copyCodeToClipboard = () => {
    navigator.clipboard.writeText(streamlitPythonCode);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // --- BOM ESTIMATOR LOGIC ---
  const getLatestPrice = (materialName: string): number => {
    // Find latest record in displayChartData that has this material
    if (displayChartData && displayChartData.length > 0) {
      for (let i = displayChartData.length - 1; i >= 0; i--) {
        const val = displayChartData[i][materialName];
        if (typeof val === "number" && !isNaN(val)) {
          return val;
        }
      }
    }
    // Fallback to basePrice in MATERIAL_MAPPING
    const base = MATERIAL_MAPPING[materialName]?.basePrice || 2.0;
    if (currency === "INR") {
      return base * EXCHANGE_RATE_USD_TO_INR;
    }
    return base;
  };

  const totalPercentage = useMemo(() => {
    return composition.reduce((acc, c) => acc + c.percentage, 0);
  }, [composition]);

  const totalCost = useMemo(() => {
    return composition.reduce((acc, item) => {
      const latestPrice = getLatestPrice(item.materialName);
      const itemWeightKg = (item.percentage / 100) * (productWeight / 1000);
      return acc + (itemWeightKg * latestPrice);
    }, 0);
  }, [composition, productWeight, currency, displayChartData, useSimulation]);

  const weightedPricePerKg = useMemo(() => {
    const totalWeightKg = productWeight / 1000;
    return totalWeightKg > 0 ? totalCost / totalWeightKg : 0;
  }, [totalCost, productWeight]);

  const handleAddCompositionItem = () => {
    const existing = composition.map(c => c.materialName);
    const available = Object.keys(MATERIAL_MAPPING).find(m => !existing.includes(m)) || "Cotton";
    const currentSum = composition.reduce((acc, c) => acc + c.percentage, 0);
    const remaining = Math.max(0, 100 - currentSum);
    setComposition([...composition, { materialName: available, percentage: remaining > 0 ? remaining : 10 }]);
  };

  const handleRemoveCompositionItem = (index: number) => {
    setComposition(composition.filter((_, i) => i !== index));
  };

  const handleCompositionChange = (index: number, key: "materialName" | "percentage", value: any) => {
    setComposition(composition.map((c, i) => {
      if (i === index) {
        return {
          ...c,
          [key]: key === "percentage" ? parseFloat(value) || 0 : value
        };
      }
      return c;
    }));
  };

  const handleAutoBalance = () => {
    const sum = composition.reduce((acc, c) => acc + c.percentage, 0);
    if (sum === 0) return;
    setComposition(composition.map(c => ({
      ...c,
      percentage: parseFloat(((c.percentage / sum) * 100).toFixed(1))
    })));
  };

  const handleDownloadSampleBOM = () => {
    const csvContent = "Material,Percentage\nCotton,70\nSpandex,30\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "sample_product_BOM.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleBOMFileParsing(e.dataTransfer.files[0]);
    }
  };

  const handleBOMFileParsing = (file: File) => {
    setUploadStatus(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          const list = Array.isArray(parsed) ? parsed : (parsed.composition || parsed.BOM || parsed.materials || []);
          const parsedComp: { materialName: string; percentage: number }[] = [];
          list.forEach((item: any) => {
            const rawMat = item.material || item.materialName || item.name || "";
            const rawPct = parseFloat(item.percentage || item.percent || item.weightage || item.value || 0);
            const matchedKey = Object.keys(MATERIAL_MAPPING).find(
              (k) => k.toLowerCase() === rawMat.toString().trim().toLowerCase()
            );
            if (matchedKey && rawPct > 0) {
              parsedComp.push({ materialName: matchedKey, percentage: rawPct });
            }
          });
          if (parsedComp.length > 0) {
            setComposition(parsedComp);
            setUploadStatus({ type: "success", message: `Successfully loaded ${parsedComp.length} ingredients from JSON Bill of Materials!` });
          } else {
            setUploadStatus({ type: "error", message: "No matching material types found in JSON. Expected keys like 'material' and 'percentage' (e.g. Cotton: 70)." });
          }
        } else {
          const lines = text.split("\n");
          const parsedComp: { materialName: string; percentage: number }[] = [];
          lines.forEach((line) => {
            const columns = line.split(",");
            if (columns.length >= 2) {
              const rawMat = columns[0].trim();
              const rawPct = parseFloat(columns[1].trim());
              const matchedKey = Object.keys(MATERIAL_MAPPING).find(
                (k) => k.toLowerCase() === rawMat.toLowerCase()
              );
              if (matchedKey && !isNaN(rawPct) && rawPct > 0) {
                parsedComp.push({ materialName: matchedKey, percentage: rawPct });
              }
            }
          });
          if (parsedComp.length > 0) {
            setComposition(parsedComp);
            setUploadStatus({ type: "success", message: `Successfully parsed ${parsedComp.length} ingredients from CSV Bill of Materials!` });
          } else {
            setUploadStatus({ type: "error", message: "Could not parse CSV. Please ensure format is: Material,Percentage (e.g. Cotton,70) on each line." });
          }
        }
      } catch (err: any) {
        setUploadStatus({ type: "error", message: `Failed to read file: ${err.message}` });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div id="rm-dashboard" className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
      
      {/* HEADER BAR */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white text-[10px] font-bold">TP</div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              TexPro Connect Analytics
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Fibre2Fashion TexPro API integration engine &bull; Optimized for Google Sites iframe embedding
          </p>
        </div>

        {/* TAB CONTROLS */}
        <div className="flex bg-slate-100 p-1 rounded-lg self-stretch sm:self-auto border border-slate-200">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Interactive Panel
          </button>
          <button
            onClick={() => setActiveTab("estimator")}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "estimator"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            BOM Cost Estimator
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "code"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            Python Streamlit Code
          </button>
        </div>
      </header>

      {/* BODY WORKSPACE */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* SIDEBAR */}
        <aside className="w-full md:w-76 border-r border-slate-200 bg-white shrink-0 flex flex-col justify-between">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <Database className="w-4 h-4" />
              </span>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Configuration
              </h2>
            </div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider italic">
              API Integration Setup
            </p>
          </div>

          <div className="flex-1 p-6 space-y-5 overflow-y-auto">
            
            {/* Simulation Mode Toggle */}
            <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-lg space-y-1">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useSimulation}
                  onChange={(e) => setUseSimulation(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <div>
                  <span className="text-[11px] font-bold text-blue-900 block uppercase tracking-wider">Sandbox Mode</span>
                  <span className="text-[9px] text-blue-700 block">Mock feed (no bearer key required)</span>
                </div>
              </label>
            </div>

            {/* Currency Selector Toggle */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Pricing Currency
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded border border-slate-200">
                <button
                  onClick={() => setCurrency("USD")}
                  className={`py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    currency === "USD"
                      ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span>USD ($)</span>
                </button>
                <button
                  onClick={() => setCurrency("INR")}
                  className={`py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    currency === "INR"
                      ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span>INR (₹)</span>
                </button>
              </div>
            </div>

            {/* Bearer Token Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Bearer Token
                </label>
                <button 
                  onClick={() => setShowToken(!showToken)} 
                  className="text-[10px] text-blue-600 hover:underline font-bold uppercase tracking-wider"
                >
                  {showToken ? "Hide" : "Reveal"}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  disabled={useSimulation}
                  placeholder={useSimulation ? "Disabled in Sandbox Feed Mode" : "Bearer eyJhbGciOi..."}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded bg-white text-slate-800 disabled:opacity-50 disabled:bg-slate-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
                />
                <Key className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
              </div>
              {!useSimulation && !bearerToken && (
                <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Authorization bearer token is required
                </p>
              )}
            </div>

            {/* Date Pickers */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Start Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full pl-7 pr-1 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <Calendar className="absolute left-2 top-2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  End Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full pl-7 pr-1 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <Calendar className="absolute left-2 top-2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Multi-Select Material Options */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Materials Selection
                </label>
                <span className="text-[10px] text-slate-400 font-mono font-bold">
                  {selectedMaterials.length} SELECTED
                </span>
              </div>
              <div className="border border-slate-300 rounded divide-y divide-slate-100 max-h-56 overflow-y-auto bg-white">
                {Object.keys(MATERIAL_MAPPING).map((name) => {
                  const info = MATERIAL_MAPPING[name];
                  const isSelected = selectedMaterials.includes(name);
                  return (
                    <label 
                      key={name}
                      className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMaterial(name)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <div className="text-left flex-1 flex justify-between items-center">
                        <div>
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            {name}
                            <span 
                              className="w-1.5 h-1.5 rounded-full inline-block" 
                              style={{ backgroundColor: info.color }}
                            />
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono block">
                            ID: {info.id}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 italic">
                          ${info.basePrice}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Fetch Button */}
            <button
              onClick={handleFetchData}
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs tracking-wider uppercase rounded shadow-sm transition-all active:translate-y-px disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "FETCHING MARKET DATA..." : "FETCH MARKET DATA"}
            </button>

          </div>

          <div className="p-6 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 flex justify-between animate-fade-in">
            <span>Status: {useSimulation ? "Sandbox Active" : "API Ready"}</span>
            <span className="font-bold">{currency} / KG</span>
          </div>
        </aside>

        {/* MAIN VISUALIZATION AREA */}
        <main className="flex-1 p-8 overflow-y-auto space-y-6">
          {apiError && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider">Parameters Advisory</h4>
                <p className="text-xs text-amber-700 mt-1 font-medium">{apiError}</p>
                {useSimulation && (
                  <p className="text-[10px] text-amber-600 mt-1.5 font-bold uppercase tracking-wider">
                    Please keep Sandbox Mode active in the left sidebar to preview live with high-fidelity graphs.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "dashboard" ? (
            <div className="space-y-6">
              
              {/* TOP HEADER */}
              <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end pb-4 border-b border-slate-200 gap-4">
                <div>
                  <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Raw Material Analytics</h1>
                  <p className="text-slate-500 text-sm mt-1 font-medium">Fibre2Fashion TexPro Real-time Pricing Stream</p>
                </div>
                <div className="flex gap-4">
                  <div className="text-right border-l pl-4 border-slate-200">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Last Response Status</p>
                    <p className={`text-sm font-mono font-bold ${loading ? "text-amber-500" : apiError ? "text-rose-500" : "text-green-600"}`}>
                      {loading ? "PENDING..." : apiError ? "ERR_CONNECTION" : "200 OK (0.4s)"}
                    </p>
                  </div>
                </div>
              </header>

              {/* STATS HIGHLIGHT BENTO */}
              {selectedMaterials.length > 0 && Object.keys(activeStats).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {selectedMaterials.map((mat) => {
                    const stats = activeStats[mat];
                    const info = MATERIAL_MAPPING[mat];
                    if (!stats || !info) return null;
                    const isPositive = stats.change >= 0;
                    return (
                      <div key={mat} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between transition-all hover:shadow-md">
                        {/* Material label */}
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: info.color }} />
                              {mat} (ID: {info.id})
                            </p>
                            <span className="text-[10px] text-slate-500 font-medium">{info.description}</span>
                          </div>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded flex items-center ${
                            isPositive ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                          }`}>
                            {isPositive ? "+" : ""}{stats.change}%
                          </span>
                        </div>

                        {/* Middle Stat */}
                        <div className="my-4">
                          <h3 className="text-3xl font-bold text-slate-800 tracking-tight font-mono">{formatPriceValue(stats.avg)}</h3>
                          <span className="text-[10px] uppercase font-bold text-slate-400">weighted avg index</span>
                        </div>

                        {/* Bottom stats details */}
                        <div className="flex justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-500 font-mono">
                          <span>Min: <strong className="text-slate-800">{formatPriceValue(stats.min)}</strong></span>
                          <span>Max: <strong className="text-slate-800">{formatPriceValue(stats.max)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* MAIN CHART CONTAINER */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-150 bg-slate-50/50 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-600 tracking-wider uppercase">Historical Price Index (L6M)</span>
                  <div className="flex flex-wrap gap-4">
                    {selectedMaterials.map((mat) => {
                      const color = MATERIAL_MAPPING[mat]?.color || "#3B82F6";
                      return (
                        <div key={mat} className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
                          {mat}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-6">
                  {loading ? (
                    <div className="h-80 flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-wider animate-pulse">Querrying Fibre2Fashion Servers...</span>
                    </div>
                  ) : displayChartData.length > 0 ? (
                    <div className="h-96 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={displayChartData}
                          margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeWidth={0.5} />
                          <XAxis 
                            dataKey="date" 
                            stroke="#94a3b8" 
                            fontSize={10} 
                            fontFamily="JetBrains Mono"
                            tickLine={false} 
                            dy={10}
                          />
                          <YAxis 
                            stroke="#94a3b8" 
                            fontSize={10} 
                            fontFamily="JetBrains Mono"
                            tickLine={false} 
                            dx={-5}
                            tickFormatter={(v) => currency === "INR" ? `₹${v}` : `$${v}`}
                          />
                          <Tooltip
                            formatter={(v: any) => [formatPriceValue(v), "Price"]}
                            contentStyle={{ 
                              backgroundColor: "rgba(255, 255, 255, 0.98)", 
                              borderRadius: "6px", 
                              border: "1px solid #cbd5e1", 
                              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                              fontFamily: "Inter, sans-serif"
                            }}
                            labelStyle={{ fontWeight: "bold", color: "#1e293b", fontSize: "11px" }}
                            itemStyle={{ fontSize: "11px", padding: "1px 0" }}
                          />
                          {selectedMaterials.map((mat) => {
                            const info = MATERIAL_MAPPING[mat];
                            if (!info) return null;
                            return (
                              <Line
                                key={mat}
                                type="monotone"
                                dataKey={mat}
                                name={mat}
                                stroke={info.color}
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 5, strokeWidth: 0 }}
                              />
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-80 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                      <AlertTriangle className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">No chart data generated</p>
                      <p className="text-[11px] text-slate-400 max-w-xs text-center mt-1">
                        Choose materials in the sidebar and press FETCH MARKET DATA.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* DATA TABLE PREVIEW */}
              {displayChartData.length > 0 && !loading && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs animate-fade-in">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                        Tabular Price Registry
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-1 font-medium">
                        Chronological pricing record tracking values in {currency} per kilogram.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-64 border border-slate-200 rounded scrollbar-thin">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                        <tr>
                          <th className="p-3 font-mono text-[10px]">Date (YYYY-MM-DD)</th>
                          {selectedMaterials.map((mat) => {
                            const color = MATERIAL_MAPPING[mat]?.color || "#000";
                            return (
                              <th key={mat} className="p-3 text-[10px]">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                  {mat} ({currency}/KG)
                                </span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {displayChartData.map((row, index) => (
                          <tr key={row.date + index} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 text-slate-500">{row.date}</td>
                            {selectedMaterials.map((mat) => (
                              <td key={mat} className="p-3 font-bold text-slate-800">
                                {formatPriceValue(row[mat])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* BOTTOM EXPORT BUTTON */}
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleExportCSV}
                      className="flex items-center gap-2 px-6 py-2 border border-slate-300 rounded text-slate-600 hover:bg-slate-50 font-bold text-xs tracking-wider transition-colors shadow-sm bg-white cursor-pointer uppercase"
                    >
                      <Download className="w-4 h-4" />
                      DOWNLOAD EXCEL (.CSV)
                    </button>
                  </div>
                </div>
              )}

            </div>
          ) : activeTab === "estimator" ? (
            /* PRODUCT COMPOSITION COST ESTIMATOR */
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                  <div className="space-y-1">
                    <h3 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-blue-600" />
                      Product Composition Cost Estimator
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Calculate the total raw material (RM) cost based on fabric composition percentages and product unit weightage.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full font-mono">
                      Currency: {currency}
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 bg-slate-50 text-slate-600 border border-slate-100 rounded-full font-mono">
                      Mode: {useSimulation ? "Sandbox" : "Live TexPro"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Product / Article Name</label>
                    <input 
                      type="text" 
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-medium"
                      placeholder="e.g. Eco-Blend Premium Tee"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Target Unit Weight (Grams)</label>
                      <span className="text-xs font-bold text-blue-600 font-mono">{productWeight}g ({ (productWeight / 1000).toFixed(3) } kg)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input 
                        type="range" 
                        min="10" 
                        max="2000" 
                        step="5"
                        value={productWeight}
                        onChange={(e) => setProductWeight(parseInt(e.target.value) || 0)}
                        className="flex-1 accent-blue-600 cursor-pointer"
                      />
                      <input 
                        type="number" 
                        min="10" 
                        max="5000"
                        value={productWeight}
                        onChange={(e) => setProductWeight(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-20 px-2 py-1 text-xs border border-slate-300 rounded font-mono text-center font-bold bg-white"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 flex flex-col justify-end">
                    <button
                      onClick={handleDownloadSampleBOM}
                      className="w-full py-2 border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/50 text-slate-600 hover:text-blue-600 rounded transition-all text-xs font-bold flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider bg-white shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download BOM CSV Template
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* LEFT COLUMN: COMPOSITION BUILDER */}
                <div className="lg:col-span-7 space-y-6">
                  
                  {/* File Upload Box */}
                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-6 transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
                      isDragging 
                        ? "border-blue-500 bg-blue-50/40 scale-[0.99] shadow-inner" 
                        : "border-slate-300 hover:border-blue-400 bg-white shadow-sm"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleBOMFileParsing(e.target.files[0]);
                        }
                      }}
                      accept=".csv,.json,.txt"
                      className="hidden" 
                    />
                    <Upload className={`w-8 h-8 mb-2 transition-all ${isDragging ? "text-blue-600 animate-bounce" : "text-slate-400"}`} />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Upload Product Composition BOM</h4>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
                      Drag & drop or <span className="text-blue-600 font-bold hover:underline">browse</span> your CSV/JSON file to parse raw material weights automatically.
                    </p>
                  </div>

                  {uploadStatus && (
                    <div className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 animate-fade-in ${
                      uploadStatus.type === "success" 
                        ? "bg-green-50 border-green-200 text-green-800" 
                        : "bg-rose-50 border-rose-200 text-rose-800"
                    }`}>
                      <Info className={`w-4 h-4 shrink-0 mt-0.5 ${uploadStatus.type === "success" ? "text-green-600" : "text-rose-600"}`} />
                      <div className="flex-1">
                        <span className="font-bold block mb-0.5">{uploadStatus.type === "success" ? "BOM Uploaded Successfully" : "Parsing Advisement"}</span>
                        <span className="font-medium leading-relaxed">{uploadStatus.message}</span>
                      </div>
                      <button onClick={() => setUploadStatus(null)} className="font-mono text-[10px] opacity-60 hover:opacity-100 uppercase tracking-wider font-bold">dismiss</button>
                    </div>
                  )}

                  {/* Composition Manager List */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Active Fiber Composition</span>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        totalPercentage === 100 
                          ? "bg-green-50 text-green-700 border border-green-100" 
                          : "bg-amber-50 text-amber-700 border border-amber-100 animate-pulse"
                      }`}>
                        Total Percentage: {totalPercentage.toFixed(1)}% {totalPercentage === 100 ? "✔ Balanced" : "⚠ Unbalanced"}
                      </span>
                    </div>

                    <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
                      {composition.map((item, index) => {
                        const latestPrice = getLatestPrice(item.materialName);
                        const itemWeightKg = (item.percentage / 100) * (productWeight / 1000);
                        const itemCostValue = itemWeightKg * latestPrice;
                        
                        return (
                          <div key={index} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col md:flex-row items-stretch md:items-center gap-4 transition-all hover:border-slate-300">
                            <div className="w-full md:w-1/3 space-y-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider font-mono">Fiber Material</span>
                              <select
                                value={item.materialName}
                                onChange={(e) => handleCompositionChange(index, "materialName", e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-bold text-slate-800"
                              >
                                {Object.keys(MATERIAL_MAPPING).map((name) => (
                                  <option key={name} value={name}>{name} (ID: {MATERIAL_MAPPING[name].id})</option>
                                ))}
                              </select>
                            </div>

                            <div className="flex-1 space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider font-mono">Weight Percentage</span>
                                <span className="text-xs font-bold text-slate-700 font-mono">{item.percentage}%</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <input 
                                  type="range"
                                  min="1"
                                  max="100"
                                  value={item.percentage}
                                  onChange={(e) => handleCompositionChange(index, "percentage", parseFloat(e.target.value) || 0)}
                                  className="flex-1 accent-blue-600 cursor-pointer"
                                />
                                <input 
                                  type="number"
                                  min="1"
                                  max="100"
                                  value={item.percentage}
                                  onChange={(e) => handleCompositionChange(index, "percentage", parseFloat(e.target.value) || 0)}
                                  className="w-14 px-1 py-0.5 text-xs border border-slate-300 rounded font-mono text-center bg-white font-bold"
                                />
                              </div>
                            </div>

                            <div className="w-full md:w-32 flex flex-row md:flex-col justify-between md:justify-center items-center md:items-end text-right border-t md:border-t-0 border-slate-200 pt-2.5 md:pt-0 shrink-0">
                              <div className="text-left md:text-right">
                                <span className="text-[9px] text-slate-400 font-mono block uppercase font-bold">Contribution</span>
                                <span className="text-xs font-bold text-slate-800 font-mono">
                                  { (itemWeightKg * 1000).toFixed(1) }g &bull; { formatPriceValue(itemCostValue) }
                                </span>
                              </div>
                              <button 
                                onClick={() => handleRemoveCompositionItem(index)}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors md:mt-1 cursor-pointer"
                                title="Remove ingredient"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {composition.length === 0 && (
                        <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg bg-slate-50">
                          <AlertTriangle className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                          <p className="text-xs font-bold text-slate-500 uppercase">No active materials</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Click "Add Material" or upload a BOM file to start tracking cost!</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between gap-3 pt-3 border-t border-slate-150">
                      <button
                        onClick={handleAddCompositionItem}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer uppercase tracking-wider shadow-xs"
                      >
                        <Plus className="w-4 h-4 text-slate-500" />
                        Add Material Ingredient
                      </button>

                      {totalPercentage !== 100 && totalPercentage > 0 && (
                        <button
                          onClick={handleAutoBalance}
                          className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer uppercase tracking-wider"
                        >
                          <Percent className="w-4 h-4" />
                          Auto-Balance to 100%
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: COST ESTIMATOR & ANALYTICS OUTPUT */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-6 shadow-md relative overflow-hidden">
                    <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 pointer-events-none">
                      <Calculator className="w-48 h-48" />
                    </div>

                    <div className="relative z-10 space-y-5">
                      <span className="text-[10px] font-bold tracking-wider uppercase bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded border border-blue-500/30 font-mono">
                        Finished Product Modeling
                      </span>

                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider truncate">{productName || "Modeling Product"}</h4>
                        <span className="text-[11px] text-slate-400 block font-mono">BOM Total weight: {productWeight}g</span>
                      </div>

                      <div className="py-4 border-y border-white/10">
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Total Raw Material (RM) Cost</p>
                        <h3 className="text-4xl font-black text-white tracking-tight mt-1 font-mono">
                          {formatPriceValue(totalCost)}
                        </h3>
                        <p className="text-[9px] text-slate-400 mt-1 italic font-medium">
                          *Calculated per piece based on Fibre2Fashion Texpro rates
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-1 text-xs text-slate-300 font-mono">
                        <div>
                          <span className="text-[9px] uppercase text-slate-400 font-sans block font-bold tracking-wider">Weighted Cost / KG</span>
                          <span className="font-bold text-white text-sm">{formatPriceValue(weightedPricePerKg)} / KG</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase text-slate-400 font-sans block font-bold tracking-wider">Constituent Yield</span>
                          <span className="font-bold text-white text-sm">{(productWeight / 1000).toFixed(3)} KG</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* COST VS WEIGHT SEGMENTED ANALYSIS */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      Material Leverage Analysis
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                      Compare the weight contribution against the actual cost contribution of each fiber ingredient in the finished article.
                    </p>

                    <div className="space-y-4 pt-2">
                      {composition.map((item, index) => {
                        const itemWeightKg = (item.percentage / 100) * (productWeight / 1000);
                        const latestPrice = getLatestPrice(item.materialName);
                        const itemCost = itemWeightKg * latestPrice;
                        const costPercentage = totalCost > 0 ? (itemCost / totalCost) * 100 : 0;
                        const color = MATERIAL_MAPPING[item.materialName]?.color || "#cbd5e1";

                        return (
                          <div key={index} className="space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                                {item.materialName}
                              </span>
                              <span className="font-mono text-slate-500 text-[11px]">
                                Weight: <strong className="text-slate-800">{item.percentage}%</strong> &bull; Cost: <strong style={{ color: color }}>{costPercentage.toFixed(1)}%</strong>
                              </span>
                            </div>

                            <div className="space-y-1">
                              {/* Weight bar */}
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="bg-slate-400 h-full rounded-full transition-all" 
                                  style={{ width: `${item.percentage}%` }}
                                />
                              </div>
                              {/* Cost bar */}
                              <div className="w-full bg-slate-150 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="h-full rounded-full transition-all" 
                                  style={{ width: `${costPercentage}%`, backgroundColor: color }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {composition.length > 0 ? (
                        <div className="flex gap-4 pt-2 text-[10px] text-slate-400 font-bold uppercase justify-center border-t border-slate-100 font-mono">
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-1 bg-slate-400 rounded-full inline-block" /> Weight %
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-1 bg-blue-500 rounded-full inline-block" /> Cost %
                          </span>
                        </div>
                      ) : (
                        <div className="text-center text-slate-400 text-[11px] py-4">
                          No active fiber metrics to analyze.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            
            /* PYTHON STREAMLIT TEMPLATE CODE VIEW */
            <div className="space-y-6">
              
              {/* CODE TITLE INFORMATION BAR */}
              <div className="bg-slate-900 text-slate-100 rounded-xl p-6 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4 font-mono select-none text-[150px] leading-none text-white pointer-events-none">
                  PY
                </div>
                
                <div className="relative z-10 space-y-3 max-w-3xl">
                  <span className="text-[10px] font-bold tracking-wider uppercase bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">
                    Production Recipe
                  </span>
                  <h3 className="text-xl font-extrabold tracking-tight">Fibre2Fashion Streamlit Integration Template</h3>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    This single-file Python script provides a robust, fully production-ready Streamlit implementation.
                    It has been fully optimized specifically for seamless embedding as an iframe within custom Google Sites page grids.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2 text-[10px] font-mono text-slate-400 font-bold">
                    <span className="bg-slate-800 px-2.5 py-1 rounded border border-slate-700/50">✔ LAYOUT WIDE</span>
                    <span className="bg-slate-800 px-2.5 py-1 rounded border border-slate-700/50">✔ ZERO EMBED MARGINS</span>
                    <span className="bg-slate-800 px-2.5 py-1 rounded border border-slate-700/50">✔ TRANSPARENT PLOTLY PLOT</span>
                  </div>
                </div>
              </div>

              {/* EMBEDDING EXPLANATION CARD */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                  <Info className="w-4 h-4 text-blue-500" />
                  How to Run & Deploy this Script
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
                  <div className="space-y-1.5 p-3.5 bg-slate-50 rounded border border-slate-200">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                      <span className="bg-blue-100 text-blue-800 w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] font-bold">1</span>
                      Install Packages
                    </span>
                    <p className="text-[11px] leading-relaxed text-slate-500 font-medium">
                      Install the core dependencies on your server or local system machine:
                    </p>
                    <code className="block bg-slate-900 text-slate-100 p-2 rounded font-mono text-[10px] mt-2 border border-slate-800">
                      pip install streamlit requests pandas plotly
                    </code>
                  </div>

                  <div className="space-y-1.5 p-3.5 bg-slate-50 rounded border border-slate-200">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                      <span className="bg-blue-100 text-blue-800 w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] font-bold">2</span>
                      Run Application
                    </span>
                    <p className="text-[11px] leading-relaxed text-slate-500 font-medium">
                      Save this code block as <code className="bg-slate-200 text-slate-700 px-1 rounded font-mono">app.py</code> and execute using the Streamlit CLI:
                    </p>
                    <code className="block bg-slate-900 text-slate-100 p-2 rounded font-mono text-[10px] mt-2 border border-slate-800">
                      streamlit run app.py
                    </code>
                  </div>

                  <div className="space-y-1.5 p-3.5 bg-slate-50 rounded border border-slate-200">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                      <span className="bg-blue-100 text-blue-800 w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] font-bold">3</span>
                      Embed in Google Site
                    </span>
                    <p className="text-[11px] leading-relaxed text-slate-500 font-medium">
                      Deploy the Streamlit app to Streamlit Community Cloud or any Cloud service, then insert the URL as an "Embed" link on your Google Sites page editor!
                    </p>
                  </div>
                </div>
              </div>

              {/* CODE BLOCK BLOCK WITH HEADER */}
              <div className="bg-[#1e1e2e] border border-slate-800 rounded shadow-lg overflow-hidden font-mono text-xs">
                
                {/* code header */}
                <div className="bg-[#181825] px-4 py-3 border-b border-[#2e2e3e] flex justify-between items-center text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                    <span className="text-slate-400 font-bold text-xs ml-2 select-none uppercase tracking-wider">app.py (Streamlit Script)</span>
                  </div>
                  
                  <button
                    onClick={copyCodeToClipboard}
                    className="px-3 py-1.5 bg-[#2e2e3e] hover:bg-[#3e3e4e] text-slate-200 rounded flex items-center gap-1.5 transition-colors text-xs cursor-pointer select-none font-bold uppercase tracking-wider"
                  >
                    {copySuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>

                {/* code text area */}
                <div className="p-4 overflow-x-auto max-h-[500px] text-slate-300 select-all leading-relaxed font-mono text-[11px]">
                  <pre>{streamlitPythonCode}</pre>
                </div>

              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}
