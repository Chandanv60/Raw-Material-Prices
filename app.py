"""Fibre2Fashion TexPro RM Historical Pricing & BOM Cost Estimator
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
