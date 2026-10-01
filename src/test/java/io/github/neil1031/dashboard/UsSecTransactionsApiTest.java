package io.github.neil1031.dashboard;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class UsSecTransactionsApiTest {
    @Test void noStoreExactQueryAndSecOnlyResponse() throws Exception {
        var a = mock(InsiderSignalsAdapter.class); var json = new ObjectMapper();
        var source = json.readTree(getClass().getResourceAsStream("/fixtures/sec-transactions-v1.json"));
        var response = new InsiderSignalsAdapter(new InsiderProperties(false,"","",10),json).normalizeSec(source,null,50,0);
        when(a.readSec(null,50,0)).thenReturn(response);
        var mvc = MockMvcBuilders.standaloneSetup(new UsSecTransactionsController(a)).build();
        mvc.perform(get("/api/us/sec-transactions")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.items[0].candidateOpenMarketPurchase").value(true)).andExpect(jsonPath("$.items[1].transactionCode").value("S"))
            .andExpect(jsonPath("$.items[0].scores").doesNotExist()).andExpect(jsonPath("$.items[0].provenance[0].location").doesNotExist());
        when(a.readSec(" qa ",10,20)).thenReturn(response);
        mvc.perform(get("/api/us/sec-transactions").param("ticker"," qa ").param("limit","10").param("offset","20")).andExpect(status().isOk());
        verify(a).readSec(" qa ",10,20); verify(a,never()).read(any(),anyInt(),anyInt());
    }
    @Test void unavailableAndInvalidQueriesAreTruthfulPrivateAndBounded() throws Exception {
        var a = new InsiderSignalsAdapter(new InsiderProperties(false,"","",10),new ObjectMapper());
        var mvc = MockMvcBuilders.standaloneSetup(new UsSecTransactionsController(a)).build();
        mvc.perform(get("/api/us/sec-transactions")).andExpect(status().isOk()).andExpect(jsonPath("$.dataState").value("UNAVAILABLE"))
            .andExpect(jsonPath("$.sources[0].lastObservedAt").isEmpty());
        for (String v : List.of("0","101","2147483648","hello")) mvc.perform(get("/api/us/sec-transactions").param("limit",v)).andExpect(status().isBadRequest());
        for (String v : List.of("-1","1000001","9223372036854775808")) mvc.perform(get("/api/us/sec-transactions").param("offset",v)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/us/sec-transactions").param("ticker","C:\\secret\\db")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_SEC_TRANSACTIONS_QUERY"));
    }
}
