# People pipeline — realistic avatars and motion capture

Converts [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) avatars and animations
(MIT licence, see `components/market3d/assets/people/LICENSE-Rocketbox.txt`) into the compact `FMP1`
packs the market engine loads (`components/market3d/engine/people/pack.ts`).

Uses only this project's three.js (`FBXLoader` in Node) and Pillow — no native converters.

```bash
# 1. download an avatar: Assets/Avatars/<group>/<Name>/Export/<Name>.fbx + its Textures/*.tga
# 2. textures → web set (body 1024 + normal + roughness-from-specular, head, hair cards)
python catalog/people-pipeline/textures.py <Name>/Textures out/<Name>
# 3. mesh + skeleton → quantized pack
node catalog/people-pipeline/convert-avatar.mjs <Name>/<Name>.fbx out/<Name>/mesh.bin
# 4. animation (static = in place, xy = with root motion; walks need xy so stride speed can be measured)
node catalog/people-pipeline/convert-anim.mjs m_walk_neutral_01.max.fbx m_walk_neutral_01.bin m_walk_neutral_01 out/Male_Adult_05/mesh.bin [maxSeconds=14]
```

Copy the results to `components/market3d/assets/people/` as `<Name>.bin`, `<Name>-body.jpg`, … and
`anims/<clip>.bin`, then list the avatar in `ROSTER` (`engine/people/library.ts`).

| Pack | Contents |
|---|---|
| avatar | indexed mesh (uint16 positions/uvs, int8 normals, uint8 skin), 81-bone skeleton, inverse bind matrices |
| clip | int16 quaternion tracks for body bones (facial bones are procedural), constant tracks collapsed, root kept in place with the captured ground speed; clips longer than `maxSeconds` are trimmed and blended back into their first pose so they loop seamlessly |

Typical sizes: avatar ≈ 150 KB mesh + 250 KB textures; walk loop ≈ 10 KB; 14 s idle ≈ 115 KB.
