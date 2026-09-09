export function getVisitorId() {
    let id = localStorage.getItem("tmn-visitor-id");
    if (!id) {
        id = `v-${crypto.randomUUID()}`;
        localStorage.setItem("tmn-visitor-id", id);
    }
    return id;
}
