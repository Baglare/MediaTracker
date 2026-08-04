# Goal System Manuel Kabul Testleri

Bu liste otomatik testlerin yerine geçmez. Test verilerini guest veya disposable local owner üzerinde kullanın; production Supabase'e bağlanmayın.

## Local CRUD ve owner

1. Guest olarak library, media type ve exact media scope'larında hedef oluşturun; edit, cancel, archive, reactivate ve onaylı delete uygulayın.
2. Reload/remount sonrası tanımların korunduğunu; `createdAt` semantiğinin değişmediğini doğrulayın.
3. Hesap A → hesap B → logout/guest geçişlerinde önceki owner hedefinin bir frame dahi görünmediğini kontrol edin.
4. Bağlı medyayı silin. Goal korunmalı, başka medyaya bağlanmamalı ve “Bağlı medya bulunamadı” göstermelidir.
5. Yalnız medya status veya tema/collapsible değiştirin. Goal definition store'u yeniden yazılmamalıdır.

## Evaluation

1. Episode, chapter ve page hedeflerinde increment uygulayın; kart navigation olmadan güncellenmelidir.
2. `manual_adjust` ile ilerlemeyi artırıp azaltın; yüzde clamp edilirken gerçek `currentValue` target'ı aşabilmelidir.
3. Film/completed-media hedefinde dönem içi completion üretin; status'u completed dışına düzeltince contribution düşmelidir.
4. Logsuz imported completed kayıt sayılmamalı ve kullanıcıya teknik enum yerine anlaşılır geçmiş uyarısı gösterilmelidir.
5. One-time sınırları, Pazartesi haftası, yerel ay, DST, leap year ve Aralık/Ocak fixture'larını kontrol edin.
6. `not_started`, `in_progress`, `reached`, `expired` ve eksik exact media için `inactive_target` etiketlerini doğrulayın.

## Suggestions

1. İçinde bulunulan hafta/ayı değiştiren logların öneri geçmişine katılmadığını doğrulayın.
2. Üç katkılı tamamlanmış dönemden az geçmişte öneri bölümü büyük boş alan veya hata göstermemelidir.
3. Outlier içeren geçmişte bounded, pozitif hedef ve “geçmiş hızına göre makul öneri” dilini kontrol edin; AI etiketi olmamalıdır.
4. Öneriyi onaylayın: aktif `origin=suggested` Goal oluşmalı ve aynı öneri kaybolmalıdır.
5. “Şimdilik gizle” kararının yalnız session ve owner içinde kaldığını kontrol edin.

## Portable Backup V3

1. V2 backup preview/import açın; geçerli kalmalıdır.
2. V3 export içinde manual/suggested ve active/cancelled/archived Goal tanımlarını kontrol edin.
3. Aynı ID + aynı payload tekrar importunu idempotent; farklı payload'ı açık conflict olarak doğrulayın.
4. Exact-copy media importunda media-scope Goal'un yalnız seçilen record-ID haritasıyla remap edildiğini kontrol edin.
5. Hedef medya import edilmezse Goal korunmalı ve evaluation media missing göstermelidir.
6. Import sonrası undo uygulayın; Goal ve undispatched queue snapshot'ı önceki state'e dönmelidir.
7. Export JSON'ında evaluation, suggestion, revision, queue, operation ledger, conflict ve tombstone metadata bulunmamalıdır.

## Cloud flag ve conflict

1. Goal flag kapalıyken local CRUD/evaluation'ın çalıştığını ve Goal queue oluşmadığını doğrulayın.
2. Flag açık, schema stage absent iken “Hedef senkronizasyonu durduruldu” mesajını; Media Cloud durumunun bağımsız kaldığını kontrol edin.
3. Fixture ile newer Cloud revision, remote tombstone, local delete/newer Cloud, operation ID reuse ve malformed definition kartlarını açın.
4. Cloud'u kullan, yereli güncel revision üzerine yaz ve yeni UUID'li kopya seçeneklerini ayrı ayrı uygulayın. “Daha sonra çöz” blocked operation'ı korumalıdır.
5. Kullanıcıya raw RPC/SQL metni, secret veya başka owner conflict'i gösterilmediğini doğrulayın.

## Responsive ve erişilebilirlik

1280×720, 1366×768, 1536×864 ve 375×812 boyutlarında Goal kartı, form, suggestions, backup preview ve conflict panelini kontrol edin. Belge/kart yatay taşmamalıdır. Dialog Escape, focus trap, focus return ve input `aria-describedby` ilişkileri çalışmalıdır. Console error, hydration warning ve request loop olmamalıdır.
