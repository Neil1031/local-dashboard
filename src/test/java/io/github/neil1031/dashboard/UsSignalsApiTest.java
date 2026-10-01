package io.github.neil1031.dashboard;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class UsSignalsApiTest {
    @Test void defaultBoundsNoStoreAndNormalizedResponse() throws Exception {
        var adapter = mock(InsiderSignalsAdapter.class); var json = new ObjectMapper();
        var source = json.readTree(getClass().getResourceAsStream("/fixtures/report-signals-v1.json"));
        var response = new InsiderSignalsAdapter(new InsiderProperties(false,"","",10),json).normalize(source, null,50,0);
        when(adapter.read(null,50,0)).thenReturn(response);
        var mvc = MockMvcBuilders.standaloneSetup(new UsSignalsController(adapter)).build();
        mvc.perform(get("/api/us/signals")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$.dataState").value("READY")).andExpect(jsonPath("$.items[0].scores.investment.value").isEmpty())
                .andExpect(jsonPath("$.items[0].listedBuyerCount").value(1)).andExpect(jsonPath("$.items[0].provenance[0].location").doesNotExist());
        verify(adapter).read(null,50,0);
        when(adapter.read(" coo ",10,20)).thenReturn(response);
        mvc.perform(get("/api/us/signals").param("ticker"," coo ").param("limit","10").param("offset","20")).andExpect(status().isOk());
        verify(adapter).read(" coo ",10,20);
    }
    @Test void invalidParametersAreBoundedWithoutEchoingInput() throws Exception {
        var a = new InsiderSignalsAdapter(new InsiderProperties(false,"","",10),new ObjectMapper());
        var mvc = MockMvcBuilders.standaloneSetup(new UsSignalsController(a)).build();
        for (String v : List.of("0","101","2147483648","hello")) mvc.perform(get("/api/us/signals").param("limit",v)).andExpect(status().isBadRequest());
        for (String v : List.of("-1","1000001","9223372036854775808")) mvc.perform(get("/api/us/signals").param("offset",v)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/us/signals").param("ticker","C:\\secret\\report")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_SIGNALS_QUERY"));
    }
}
