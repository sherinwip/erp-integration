package com.technomile.erpconfigapi.common;

import com.technomile.erpconfigapi.entity.*;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class MapperUtilTest {

    @Test
    void shouldMapAllEntities() {
        OffsetDateTime now = OffsetDateTime.now();

        Client c = new Client();
        c.setClientId("c1");
        c.setClientName("Client");
        c.setIsActive(true);
        c.setCreatedAt(now);
        assertEquals("c1", MapperUtil.toClientRead(c).client_id());

        Target t = new Target();
        t.setTargetId("t1");
        t.setClientId("c1");
        t.setTargetName("T");
        t.setBaseUrl("http://x");
        t.setAuthType("oauth2");
        t.setCredentialRef("cr");
        t.setDefaultHeaders(Map.of("h", "v"));
        t.setIsActive(true);
        t.setUpdatedAt(now);
        assertEquals("t1", MapperUtil.toTargetRead(t).target_id());

        Step s = new Step();
        s.setStepPk(1L);
        s.setClientId("c1");
        s.setTargetId("t1");
        s.setStepName("step");
        s.setMethod("POST");
        s.setPath("/x");
        s.setQueryParams(Map.of());
        s.setHeaders(Map.of());
        s.setExtract(Map.of());
        s.setOnNotFound("fail");
        s.setOnMultipleResults("useFirst");
        s.setRollbackMethod("POST");
        s.setRollbackPath("/r");
        s.setIsActive(true);
        s.setUpdatedAt(now);
        assertEquals(1L, MapperUtil.toStepRead(s).step_pk());

        Pipeline p = new Pipeline();
        p.setPipelineId("p1");
        p.setClientId("c1");
        p.setVersion("1.0");
        p.setSourceSystem("SRC");
        p.setObjectType("OBJ");
        p.setEventType("*");
        p.setPatternId("PAT-01");
        p.setStatus("active");
        p.setRetryMaxAttempts(3);
        p.setRetryBackoff("exponential");
        p.setRetryBackoffBaseMs(2000);
        p.setRetryOnStatusCodes("500,502");
        p.setCreatedAt(now);
        p.setUpdatedAt(now);
        assertEquals("p1", MapperUtil.toPipelineRead(p).pipeline_id());

        PipelineStep ps = new PipelineStep();
        ps.setPipelineStepPk(2L);
        ps.setPipelineId("p1");
        ps.setStepPk(1L);
        ps.setSeq(1);
        assertEquals(2L, MapperUtil.toPipelineStepRead(ps).pipeline_step_pk());

        FieldMapping fm = new FieldMapping();
        fm.setMappingPk(3L);
        fm.setStepPk(1L);
        fm.setSourcePath("a");
        fm.setTargetPath("b");
        fm.setTransformType("none");
        fm.setTransformParams(null);
        fm.setDefaultValue(null);
        fm.setIsRequired(false);
        fm.setSortOrder(0);
        fm.setArraySourcePath("");
        fm.setArrayTargetPath("");
        fm.setIsSingletonArray(false);
        fm.setIsObjectTarget(false);
        assertEquals(3L, MapperUtil.toFieldMappingRead(fm).mapping_pk());
    }
}
