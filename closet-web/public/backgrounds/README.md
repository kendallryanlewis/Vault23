# Background Images

Place your background image files here with these exact names:

- `Background_1.jpg`
- `Background_2.jpg`
- `Background_3.jpg`
- `Background_4.jpg`
- `Background_5.jpg`

These files will be bundled into the Angular build output (`www/backgrounds/`) and served
by the `BundleSchemeHandler` in the iOS app at `app://localhost/backgrounds/Background_N.jpg`.

After adding the images, rebuild the Angular app:
```
cd closet-web && ng build --configuration development
```
Then copy the `dist/closet-web/browser/` output to the Xcode project's `www/` Run Script phase.
