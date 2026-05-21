Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile("economy-cart/icons/icon-192.jpg")
$sizes = @(48, 72, 96, 128, 192, 256, 384, 512)

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($source, 0, 0, $size, $size)
    $bmp.Save("economy-cart/icons/icon-$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bmp.Dispose()
}
$source.Dispose()
Remove-Item economy-cart/icons/*.jpg
