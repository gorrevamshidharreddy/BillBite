import pandas as pd

csv_path = r"C:\Users\gorre\OneDrive\Documents\Liquor_data.csv"
df = pd.read_csv(csv_path)

print("Column names (exact):")
print(df.columns.tolist())
print("\nFirst row data:")
first_row = df.iloc[0]
for col in df.columns:
    print(f"{col}: '{first_row[col]}'")
print("\nData types:")
print(df.dtypes)
print("\nSample of Brand code (first 5):")
print(df['Brand code'].head().tolist())
print("\nSample of Size_ML (first 5):")
print(df['Size_ML'].head().tolist())
print("\nSample of Brand Name (first 5):")
print(df['Brand Name'].head().tolist())
print("\nNumber of rows where Size_ML is >0:")
print((df['Size_ML'] > 0).sum())