"""Build the shop item template workbook (uploaded to Drive and converted to a Google Sheet)."""
import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule

out = sys.argv[1]
FONT = "Arial"
HEAD_FILL = PatternFill("solid", fgColor="1F4E5A")
HEAD_FONT = Font(name=FONT, bold=True, color="FFFFFF")
CALC_FILL = PatternFill("solid", fgColor="EDEDED")
BODY = Font(name=FONT)
LAST = 300  # rows prepared with formulas and dropdowns

wb = Workbook()

# ---------------- Items ----------------
ws = wb.active
ws.title = "Items"
headers = ["ID", "Title", "Category", "Price (SAR)", "Status", "Condition",
           "New price (SAR)", "New price link", "Saving vs new", "Description",
           "Details", "Date added"]
widths = [10, 34, 18, 12, 12, 12, 15, 30, 14, 45, 30, 13]
ws.append(headers)
for i, (h, w) in enumerate(zip(headers, widths), start=1):
    c = ws.cell(row=1, column=i)
    c.font, c.fill = HEAD_FONT, HEAD_FILL
    c.alignment = Alignment(vertical="center", wrap_text=True)
    ws.column_dimensions[c.column_letter].width = w
ws.row_dimensions[1].height = 30
ws.freeze_panes = "B2"

example = ["K-001", "Philips blender with 2 jars", "Kitchen", 50, "available", "Good",
           180, None, None, "Works perfectly, small scratch on the base.",
           "Philips, 600 W, white", "2026-11-20"]
for i, v in enumerate(example, start=1):
    ws.cell(row=2, column=i, value=v)

for r in range(2, LAST + 1):
    ws.cell(row=r, column=9, value=f'=IF(OR(D{r}="",G{r}=""),"",1-D{r}/G{r})')
    ws.cell(row=r, column=9).number_format = "0%"
    ws.cell(row=r, column=9).fill = CALC_FILL
    ws.cell(row=r, column=4).number_format = "#,##0"
    ws.cell(row=r, column=7).number_format = "#,##0"
    ws.cell(row=r, column=12).number_format = "@"
    for col in (10, 11):
        ws.cell(row=r, column=col).alignment = Alignment(wrap_text=True, vertical="top")
    for col in range(1, 13):
        ws.cell(row=r, column=col).font = BODY

dv_cat = DataValidation(type="list", formula1="=Lists!$A$2:$A$40", allow_blank=True)
dv_status = DataValidation(type="list", formula1="=Lists!$C$2:$C$4", allow_blank=True)
dv_cond = DataValidation(type="list", formula1="=Lists!$E$2:$E$6", allow_blank=True)
for dv, col in ((dv_cat, "C"), (dv_status, "E"), (dv_cond, "F")):
    ws.add_data_validation(dv)
    dv.add(f"{col}2:{col}{LAST}")

rng = f"A2:L{LAST}"
ws.conditional_formatting.add(rng, FormulaRule(
    formula=['$E2="sold"'], fill=PatternFill("solid", fgColor="D9D9D9"),
    font=Font(color="808080", strike=True)))
ws.conditional_formatting.add(f"E2:E{LAST}", FormulaRule(
    formula=['$E2="available"'], fill=PatternFill("solid", fgColor="D9EAD3")))
ws.conditional_formatting.add(f"E2:E{LAST}", FormulaRule(
    formula=['$E2="reserved"'], fill=PatternFill("solid", fgColor="FCE5CD")))

# ---------------- Settings ----------------
st = wb.create_sheet("Settings")
rows = [
    ("Setting", "Value", "What it is used for"),
    ("Shop name", "Second-hand at KAUST", "Title at the top of the website"),
    ("WhatsApp number", "+966545695728", "Number the Reserve button opens a chat with"),
    ("Currency", "SAR", "Shown next to every price"),
    ("Pickup", "Pickup on campus. We agree the time on WhatsApp.", "Shown in the info box on the website"),
    ("Payment", "Cash or bank transfer at pickup.", "Shown in the info box on the website"),
    ("Reserve message", "Hi! I would like to reserve {id}: {title} ({price} SAR). Is it still available?",
     "Text pre-filled in WhatsApp. {id}, {title} and {price} are replaced automatically."),
]
for row in rows:
    st.append(row)
for c in st[1]:
    c.font, c.fill = HEAD_FONT, HEAD_FILL
for r in range(2, len(rows) + 1):
    st.cell(row=r, column=1).font = Font(name=FONT, bold=True)
    for col in (2, 3):
        st.cell(row=r, column=col).font = BODY
        st.cell(row=r, column=col).alignment = Alignment(wrap_text=True, vertical="top")
    st.cell(row=r, column=1).alignment = Alignment(vertical="top")
st.cell(row=3, column=2).number_format = "@"
st.column_dimensions["A"].width = 18
st.column_dimensions["B"].width = 55
st.column_dimensions["C"].width = 50
st.freeze_panes = "A2"

# ---------------- Lists ----------------
ls = wb.create_sheet("Lists")
cats = ["Kitchen", "Furniture", "Home appliances", "Electronics", "Home & decor",
        "Kids & toys", "Clothing & bags", "Sports & outdoors", "Books", "Other"]
status = ["available", "reserved", "sold"]
cond = ["New", "Like new", "Good", "Fair", "Needs repair"]
for col, title in ((1, "Categories"), (3, "Status"), (5, "Condition")):
    c = ls.cell(row=1, column=col, value=title)
    c.font, c.fill = HEAD_FONT, HEAD_FILL
    ls.column_dimensions[c.column_letter].width = 20
for i, v in enumerate(cats, start=2):
    ls.cell(row=i, column=1, value=v).font = BODY
for i, v in enumerate(status, start=2):
    ls.cell(row=i, column=3, value=v).font = BODY
for i, v in enumerate(cond, start=2):
    ls.cell(row=i, column=5, value=v).font = BODY
ls.cell(row=13, column=1, value="Add new categories at the bottom of this column.").font = Font(name=FONT, italic=True, color="808080")

# ---------------- How to use ----------------
hw = wb.create_sheet("How to use")
lines = [
    ("How to use this sheet", True),
    ("", False),
    ("Everything in this file is shown on the public website. Do not write private notes, addresses or bank details here.", False),
    ("", False),
    ("Adding an item", True),
    ("1. Add a new row in the Items tab. ID, Title, Category, Price and Status are required; the rest is optional.", False),
    ("2. ID: one letter for the category plus a number, e.g. K-001 (Kitchen), F-001 (Furniture), E-001 (Electronics), A-001 (Appliances), D-001 (Decor), T-001 (Kids & toys), C-001 (Clothing & bags), S-001 (Sports), B-001 (Books), O-001 (Other). Never reuse an ID.", False),
    ("3. Photos: in the Photos folder in Drive, create a folder named exactly like the ID (e.g. K-001) and upload the photos of that item into it. The first photo (by name) is the main one.", False),
    ("4. New price (SAR) and New price link: the price of the same or a similar new item, for example on Amazon.sa or IKEA. The website then shows how much the buyer saves.", False),
    ("", False),
    ("When someone reserves or buys", True),
    ("Change Status to reserved when someone reserves it, and to sold when it is picked up and paid. The website updates within a few minutes.", False),
    ("Sold rows turn grey here. You can leave them in the sheet; the website shows them as sold.", False),
    ("", False),
    ("Colour key", True),
    ("White cells: fill these in. Grey column (Saving vs new): calculated, do not type in it.", False),
    ("", False),
    ("Settings tab", True),
    ("Change the shop name, WhatsApp number, pickup and payment text there. The website reads it automatically.", False),
]
for i, (text, bold) in enumerate(lines, start=1):
    c = hw.cell(row=i, column=1, value=text)
    c.font = Font(name=FONT, bold=bold, size=13 if i == 1 else 10)
    c.alignment = Alignment(wrap_text=True, vertical="top")
hw.column_dimensions["A"].width = 110

wb.move_sheet("How to use", offset=-3)
wb.active = 1
wb.save(out)
print("saved", out)
