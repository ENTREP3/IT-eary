# Builds docs/Lab3-Bencris-Presentation.pptx.
#
# The deck mirrors docs/lab3-worksheet.md and stops at Part 4. Part 5 is the
# live demonstration of the running system, so it needs no slides and no
# screenshots - the system itself is the visual.
#
# Slides are assembled shape by shape over PowerPoint COM rather than from a
# template, so the Bencris palette (design/tokens.json) carries through and
# nothing depends on whatever theme happens to be installed.
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-lab3-pptx.ps1

$ErrorActionPreference = 'Stop'

$root  = Split-Path -Parent $PSScriptRoot
$shots = Join-Path $root 'docs\screenshots'
$out   = Join-Path $root 'docs\Lab3-Bencris-Presentation.pptx'
if (Test-Path $out) { Remove-Item $out -Force }

# PowerPoint stores colours BGR-packed, not RGB.
function C($r, $g, $b) { return $r + ($g * 256) + ($b * 65536) }
$PAPER  = C 244 234 213
$CARD   = C 251 244 227
$INK    = C 42  24  16
$SOFT   = C 107 85  70
$ACCENT = C 200 68  42
$DARK   = C 15  20  16
$AMBER  = C 232 168 74
$RULE   = C 216 200 171

# This file is saved without a BOM, and PowerShell 5.1 would read a literal
# n-tilde as mojibake. Build the place name from a code point instead.
$NN = [char]0x00F1
$BAYAN = "Dasmari${NN}as Bayan"

$W = 960.0   # 13.333in at 72dpi - 16:9
$H = 540.0

$ppt = New-Object -ComObject PowerPoint.Application
try {
  $pres = $ppt.Presentations.Add(0)          # msoFalse - build it hidden
  $pres.PageSetup.SlideWidth  = $W
  $pres.PageSetup.SlideHeight = $H

  $slideIndex = 0

  function New-Slide($bg) {
    $script:slideIndex++
    $s = $script:pres.Slides.Add($script:slideIndex, 12)   # ppLayoutBlank
    $s.FollowMasterBackground = 0
    $s.Background.Fill.ForeColor.RGB = $bg
    $s.Background.Fill.Solid()
    return $s
  }

  function Add-Text($slide, [single]$left, [single]$top, [single]$width, [single]$height, $text, [single]$size, $bold, $color, $font) {
    $box = $slide.Shapes.AddTextbox(1, $left, $top, $width, $height)
    $box.TextFrame.WordWrap = -1
    $box.TextFrame.MarginLeft = 0; $box.TextFrame.MarginRight = 0
    $box.TextFrame.MarginTop = 0;  $box.TextFrame.MarginBottom = 0
    $tr = $box.TextFrame.TextRange
    $tr.Text = $text
    $tr.Font.Size = [single]$size
    $tr.Font.Bold = $(if ($bold) { -1 } else { 0 })
    $tr.Font.Color.RGB = $color
    $tr.Font.Name = $font
    return $box
  }

  function Add-Rule($slide, [single]$left, [single]$top, [single]$width, $color, [single]$weight) {
    $ln = $slide.Shapes.AddLine($left, $top, $left + $width, $top)
    $ln.Line.ForeColor.RGB = $color
    $ln.Line.Weight = [single]$weight
    return $ln
  }

  function Add-Card($slide, [single]$left, [single]$top, [single]$width, [single]$height, $fill, $line) {
    $sh = $slide.Shapes.AddShape(5, $left, $top, $width, $height)   # rounded rectangle
    $sh.Fill.ForeColor.RGB = $fill
    $sh.Line.ForeColor.RGB = $line
    $sh.Line.Weight = [single]1.0
    $sh.Adjustments.Item(1) = [single]0.06
    $sh.TextFrame.TextRange.Text = ''
    return $sh
  }

  function New-ContentSlide($eyebrow, $title) {
    $s = New-Slide $PAPER
    Add-Text $s 60 40 840 18 $eyebrow 11 $true $ACCENT 'Calibri' | Out-Null
    Add-Text $s 60 62 840 40 $title 28 $true $INK 'Georgia' | Out-Null
    Add-Rule $s 60 110 120 $ACCENT 2.5 | Out-Null
    return $s
  }

  function Add-Bullets($slide, [single]$left, [single]$top, [single]$width, [single]$height, $lines, [single]$size) {
    $text = ($lines | ForEach-Object { [char]0x2022 + '  ' + $_ }) -join "`r"
    $box = Add-Text $slide $left $top $width $height $text $size $false $INK 'Calibri'
    $box.TextFrame.TextRange.ParagraphFormat.SpaceWithin = [single]1.2
    $box.TextFrame.TextRange.ParagraphFormat.SpaceAfter = [single]10.0
    return $box
  }

  function Add-Footer($slide, $n) {
    Add-Text $slide 60 508 520 16 'Laboratory Exercise 3 - Bencris - Web Commercialization and E-Commerce' 9 $false $SOFT 'Calibri' | Out-Null
    Add-Text $slide 862 508 38 16 $n 9 $true $SOFT 'Consolas' | Out-Null
  }

  # ---------------------------------------------------------------- 1. title
  $s = New-Slide $DARK
  Add-Text $s 70 140 760 24 'LABORATORY EXERCISE 3  -  E-COMMERCE BUSINESS PRESENCE ENHANCEMENT' 11 $true $AMBER 'Calibri' | Out-Null
  Add-Text $s 70 180 800 120 "Strengthening the business`rpresence of Bencris" 44 $true (C 232 223 200) 'Georgia' | Out-Null
  Add-Rule $s 70 322 150 $AMBER 3 | Out-Null
  Add-Text $s 70 344 820 70 "Bencris is a local eatery inside $BAYAN, Cavite. It has no website, no page or link a customer could open, no social media and no point-of-sale system. This presentation assesses how the business operates today and plans an online presence that costs nothing to run." 14 $false (C 169 167 149) 'Calibri' | Out-Null
  Add-Text $s 70 456 820 20 'Presented by [Member 1], [Member 2], [Member 3], [Member 4] and [Member 5]' 11 $false (C 123 122 108) 'Calibri' | Out-Null

  # ------------------------------------------------- 2. client and problem
  $s = New-ContentSlide 'CLIENT BACKGROUND' 'A business with nothing online'
  Add-Bullets $s 60 144 500 330 @(
    "Bencris is a counter-service eatery inside $BAYAN, Cavite.",
    'There is no website, and no link a customer can open, save or send to a friend.',
    'There is no social media, no point-of-sale, no inventory system, and no record of sales or profit.',
    'Ordering is entirely manual: the diner walks up, looks at what is left in the trays, and orders whatever is still there.'
  ) 14 | Out-Null
  Add-Card $s 596 144 304 260 $CARD $ACCENT | Out-Null
  Add-Text $s 620 166 258 22 'THE PROBLEM THE CLIENT NAMED' 10 $true $ACCENT 'Calibri' | Out-Null
  Add-Text $s 620 196 258 190 "A diner only finds out that the ulam they came for has run out once they are already standing at the counter.`r`rThe trip is wasted, and the customer often leaves without buying anything at all." 14 $false $INK 'Calibri' | Out-Null
  Add-Footer $s '02'

  # -------------------------------------------------------- 3. part 1 (a)
  $s = New-ContentSlide 'PART 1  -  BUSINESS PRESENCE ASSESSMENT' 'Five strengths of the system'
  Add-Bullets $s 60 150 400 340 @(
    'The menu is always true. A dish hides itself once it runs out, so nobody makes a wasted trip.',
    'Ordering suits everyone. A ticket code needs no account, and a free account adds order history, live tracking and loyalty rewards.',
    'The money side is safe and free to run. Totals and discount codes are worked out by the shop records, not the phone, and no payment company takes a cut.'
  ) 13 | Out-Null
  Add-Bullets $s 500 150 400 340 @(
    'The owner can finally run and measure the business: takings, profit, best sellers, stock levels, what to buy, and prices and staff logins they can change themselves.',
    'One shop on every screen. Website, counter, dashboard, three mobile apps and an installable Android app share one identity and one set of records, and update each other live.'
  ) 13 | Out-Null
  Add-Footer $s '03'

  # -------------------------------------------------------- 4. part 1 (b)
  $s = New-ContentSlide 'PART 1  -  BUSINESS PRESENCE ASSESSMENT' 'Five opportunities that remain'
  Add-Bullets $s 60 150 400 340 @(
    'Nobody can find Bencris online. It is not published, so a search for a karinderya in the Bayan finds nothing and the shop still lives on passing foot traffic.',
    'The shop does not look like a real business yet. The address and contact number on the page are still placeholder text.',
    'The food does not look appetising. Every dish uses a stock picture, and several show the wrong food entirely.'
  ) 13 | Out-Null
  Add-Bullets $s 500 150 400 340 @(
    'A first-time visitor sees no proof the food is good. Word of mouth is what this business runs on, and none of it is visible online.',
    'There is no way to reach a customer once they leave. Every visit starts from scratch, so the business keeps winning the same customer again.'
  ) 13 | Out-Null
  Add-Footer $s '04'

  # --------------------------------------------------- 5. part 2 plan
  $s = New-ContentSlide 'PART 2  -  BUSINESS PRESENCE IMPROVEMENT PLAN' 'What we will do next, and why'
  Add-Text $s 60 142 840 20 'Seven areas, each closing one weakness from Part 1. DONE is already built; NEXT is what remains. Everything here is free to run.' 13 $false $SOFT 'Calibri' | Out-Null
  $items = @(
    @('Branding', "DONE  One identity on every screen and all three apps, shop details stored once.`rNEXT  Put the owner real address and contact in, and agree a mark and colour."),
    @('UX', "DONE  Four taps to order, cart within thumb reach, menu search, one-tap reorder.`rNEXT  Walk the whole path on a cheap phone on mobile data and fix what is slow."),
    @('SEO', "DONE  Real text naming the shop and the area, dishes in Tagalog and English.`rNEXT  Publish with a real address, and add hours and prices in the form search engines read."),
    @('Product presentation', "DONE  Bestseller, Only a few left and Sold out labels from real sales and stock.`rNEXT  Photograph every dish in daylight and replace all the stock pictures."),
    @('Trust', "DONE  Hours, address and open-now up front, trust pages, and ratings only a paid ticket can leave.`rNEXT  Gather the first real ratings once the shop is live."),
    @('Marketing and engagement', "DONE  Discount codes, a printable QR poster, accounts with history and loyalty.`rNEXT  Put the poster up, run a quiet-hours discount, and notify when food is ready.")
  )
  $x = 60.0; $y = 176.0
  foreach ($it in $items) {
    Add-Card $s $x $y 270 148 $CARD $RULE | Out-Null
    Add-Text $s ($x + 18) ($y + 16) 234 22 $it[0] 14 $true $INK 'Georgia' | Out-Null
    Add-Text $s ($x + 18) ($y + 44) 234 92 $it[1] 11 $false $SOFT 'Calibri' | Out-Null
    $x += 290
    if ($x -gt 700) { $x = 60.0; $y += 162 }
  }
  Add-Footer $s '05'

  # ------------------------------------------------------- 6. part 3 journey
  $s = New-ContentSlide 'PART 3  -  CUSTOMER JOURNEY MAPPING' 'Fifteen stages, and two loops that close'
  Add-Bullets $s 60 160 380 320 @(
    'Discovery now has three doors: a link forwarded in a chat, the printed QR poster on the wall, or a web search.',
    'The journey branches at payment. A GCash diner uploads their receipt, while a cash diner goes straight to the counter.',
    'Waiting is no longer guesswork. The diner watches the order move from preparing to ready.',
    'Two loops close the journey: a reorder returns the diner to Browse, and a shared receipt or a scanned poster starts a new person at Discover.'
  ) 13 | Out-Null
  $flow = Join-Path $shots '00-journey-flowchart.png'
  if (Test-Path $flow) {
    $pic = $s.Shapes.AddPicture($flow, 0, -1, 0, 0)
    # LockAspectRatio is on by default, so setting Height already rescales
    # Width. Touching Width afterwards shrinks the picture a second time.
    $pic.LockAspectRatio = -1
    $pic.Height = [single]396
    $pic.Top    = [single]98
    $pic.Left   = [single]($W - $pic.Width - 40)
  }
  Add-Footer $s '06'

  # ------------------------------------------------- 7. part 4 operations (a)
  $s = New-ContentSlide 'PART 4  -  WEBSITE OPERATIONS PLAN' 'Developing and launching the website'
  Add-Text $s 60 140 840 18 'Every activity below is owned by a named member, has a timeline, and leaves evidence behind.' 12 $false $SOFT 'Calibri' | Out-Null
  $dev = @(
    @('DEVELOPMENT ACTIVITIES', "Interview the owner and watch a full service at the store.`rKeep the ordering rules in the shop records, not on the phone.`rBuild the diner site, the counter screen and the owner dashboard.`rAdd accounts, live order tracking, loyalty and stock control.", '[Member 1] and [Member 2]'),
    @('LAUNCH ACTIVITIES', "Photograph every dish and write Tagalog and English descriptions.`rMake the site findable and give shared links a proper preview.`rBuild the three mobile apps, the installable app and the QR poster.`rPublish to free hosting with a public address.", '[Member 3]'),
    @('TESTING AND HANDOVER', "Run the automated checks across the whole system.`rWalk the whole path by hand on a real phone, browsing to collecting.`rTrain the owner and leave a one-page cheat sheet behind.`rProduce the worksheet, the journey diagram and this deck.", '[Member 4] and [Member 5]')
  )
  $x = 60.0
  foreach ($d in $dev) {
    Add-Card $s $x 170 270 252 $CARD $RULE | Out-Null
    Add-Text $s ($x + 18) 188 234 18 $d[0] 10 $true $ACCENT 'Calibri' | Out-Null
    Add-Text $s ($x + 18) 212 234 180 $d[1] 11 $false $INK 'Calibri' | Out-Null
    Add-Text $s ($x + 18) 396 234 16 $d[2] 10 $true $SOFT 'Calibri' | Out-Null
    $x += 290
  }
  Add-Text $s 60 440 840 20 'Timeline: four weeks, running from the week of 4 August 2026.' 12 $false $SOFT 'Calibri' | Out-Null
  Add-Footer $s '07'

  # ------------------------------------------------- 8. part 4 operations (b)
  $s = New-ContentSlide 'PART 4  -  WEBSITE OPERATIONS PLAN' 'Keeping the website running after handover'
  Add-Bullets $s 60 150 400 320 @(
    "Daily: confirm the owner has marked today's dishes available and set stock counts, so the site never advertises food that has already run out.",
    'Weekly: clear every payment the cashier flagged for review against the real GCash history, so no sale stays unexplained.',
    'Weekly: read best sellers, slow movers and net profit, then tell the owner which dishes to cook more or less of.'
  ) 13 | Out-Null
  Add-Bullets $s 500 150 400 320 @(
    'Weekly: publish genuine ratings and reply to any complaint.',
    'Monthly: choose the next discount code, set its amount and expiry, and announce it.',
    'Monthly: export the records and keep the change history safe.',
    'Monthly: re-run the access checks and change the staff passwords.'
  ) 13 | Out-Null
  Add-Text $s 60 442 840 24 'Cost to keep the website running: nothing per month. No payment gateway, no paid hosting, and no printer.' 14 $true $INK 'Georgia' | Out-Null
  Add-Footer $s '08'

  # -------------------------------------------------------------- 9. close
  $s = New-Slide $DARK
  Add-Text $s 70 170 800 24 'FROM NOTHING ONLINE TO' 12 $true $AMBER 'Calibri' | Out-Null
  Add-Text $s 70 206 820 140 "A menu that tells the truth`rbefore anyone leaves home." 38 $true (C 232 223 200) 'Georgia' | Out-Null
  Add-Rule $s 70 366 150 $AMBER 3 | Out-Null
  Add-Text $s 70 390 820 48 'The live demonstration follows: browse the menu, place an order, settle it at the counter, and watch the sale appear on the owner dashboard.' 14 $false (C 169 167 149) 'Calibri' | Out-Null
  Add-Text $s 70 456 820 20 'Salamat po.' 16 $true $AMBER 'Georgia' | Out-Null

  $pres.SaveAs($out, 24)     # ppSaveAsOpenXMLPresentation
  $count = $pres.Slides.Count
  $pres.Close()
  Write-Output "wrote docs\Lab3-Bencris-Presentation.pptx - $count slides"
}
finally {
  $ppt.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
}
