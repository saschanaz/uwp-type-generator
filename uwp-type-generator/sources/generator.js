function generate() {
    enumerate(Windows);
    function enumerate(obj) {
        for (var item in obj) {
            console.log(item);
            enumerate(obj[item]);
        }
    }
}
