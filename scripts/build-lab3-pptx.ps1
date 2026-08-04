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
  $s = New-ContentSlide 'PART 1  -  BUSINESS PRESENCE ASSESSMENT' 'What we observed on site'
  Add-Bullets $s 60 144 400 350 @(
    'The menu is the trays on the counter, so availability exists only inside the room.',
    'Diners decide and queue in the same place, so the queue moves at the speed of indecision.',
    'Trays run empty in the middle of service. This is the wasted trip, photographed.',
    'Payment is a cash box. There is no register, and no receipt is ever issued.'
  ) 13 | Out-Null
  Add-Bullets $s 500 144 400 350 @(
    "For GCash, a staff member manually photographs the customer's payment screen on their own phone.",
    'That photo is the only proof the transfer happened, and it is attached to no order at all.',
    'Orders and takings are written on paper, or are not recorded anywhere.',
    'Searching the business name online returns nothing owned by Bencris.'
  ) 13 | Out-Null
  Add-Footer $s '03'

  # -------------------------------------------------------- 4. part 1 (b)
  $s = New-ContentSlide 'PART 1  -  BUSINESS PRESENCE ASSESSMENT' 'Strengths to build on, and the gaps'
  Add-Text $s 60 138 400 18 'STRENGTHS AN ONLINE PRESENCE CAN AMPLIFY' 10 $true $ACCENT 'Calibri' | Out-Null
  Add-Bullets $s 60 164 400 330 @(
    'An established location with steady passing trade every day.',
    'A base of regular suki who already return without any marketing.',
    'A varied, freshly cooked menu, with enough range to make an online menu worth opening.',
    'GCash is already accepted, and staff already photograph every transfer.',
    'Word of mouth already brings in new customers, in person.'
  ) 13 | Out-Null
  Add-Text $s 500 138 400 18 'OPPORTUNITIES FOR IMPROVEMENT' 10 $true $ACCENT 'Calibri' | Out-Null
  Add-Bullets $s 500 164 400 330 @(
    'There is nothing online for a customer to reach at all.',
    'Availability cannot be known before making the trip to the store.',
    'Nothing exists that could spread, so word of mouth stops at a conversation.',
    'Without demand data, how much to cook each day remains guesswork.',
    'The GCash record is a photo on a personal phone that nobody can audit.'
  ) 13 | Out-Null
  Add-Footer $s '04'

  # --------------------------------------------------- 5. part 2 plan
  $s = New-ContentSlide 'PART 2  -  BUSINESS PRESENCE IMPROVEMENT PLAN' 'Growth built into the product itself'
  Add-Text $s 60 142 840 20 'There is no social page to maintain. The website itself is the marketing channel, and every mechanism below is free to run.' 13 $false $SOFT 'Calibri' | Out-Null
  $items = @(
    @('Shareable menu link', 'The link previews with the shop name and a dish photo, so a diner can drop Bencris into a group chat in one tap.'),
    @('Share on the receipt', 'A Share action on the receipt turns every satisfied diner into a distribution channel at no cost.'),
    @('Referral codes', 'A personal code rewards the diner who brings a friend, and costs a discount only when it produces a sale.'),
    @('QR code at the counter', "A QR displayed at the counter turns today's walk-in customer into tomorrow's online order."),
    @('Timed promotional codes', 'A code such as HAPON15 runs only between 2 and 4 PM, pulling demand into the quiet hours.'),
    @('Verified reviews', 'Only a ticket code that was actually paid can leave a rating, so the reviews cannot be faked.')
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
    'Discovery now has three doors: a link forwarded in a chat, the QR at the counter, or a web search.',
    'The journey branches at payment. A GCash diner uploads their receipt, while a cash diner goes straight to the counter.',
    'Two loops close the journey: a reorder returns the diner to Browse, and a shared receipt starts a new person at Discover.'
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
    @('DEVELOPMENT ACTIVITIES', "Interview the owner and observe a full service at the store.`rDesign the database and put the ordering rules in PostgreSQL.`rBuild the customer storefront, the counter screen and the owner dashboard.`rBuild the proof-of-payment flow and the promotional code engine.", '[Member 1] and [Member 2]'),
    @('LAUNCH ACTIVITIES', "Photograph every dish and write descriptions in Tagalog and English.`rAdd search visibility and proper link previews.`rBuild the share action, the counter QR and the referral codes.`rDeploy the site to free hosting with a public address.", '[Member 3]'),
    @('TESTING AND HANDOVER', "Run the three backend test suites and the mobile test suite.`rWalk the whole diner-to-owner path by hand on a phone.`rTrain the owner and leave a one-page cheat sheet behind.`rProduce the worksheet, the journey diagram and this deck.", '[Member 4] and [Member 5]')
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
    'Monthly: choose the next promotional code, set its discount and expiry, and announce it.',
    'Monthly: export the database and keep the migration history in version control.',
    'Monthly: re-run the role-separation and security tests, and rotate the staff passwords.',
    'Monthly: confirm the stored payment proofs still fit inside the free tier.'
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
